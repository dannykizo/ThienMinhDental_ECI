import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface Actor { id: string; employeeId: string; sid: string; deviceId: string; token: string; }
interface Message { id: string; title: string; body: string; status: string; readAt: string | null; acknowledgedAt: string | null; }
const label = 'R11 development-only: Thông báo tiếng Việt thử nghiệm';
const base = '/announcements';

describe.skipIf(process.env.R11_POSTGRES_TEST !== '1')('R11 announcements — isolated PostgreSQL/HTTP', () => {
  const name = `r11_push_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let db: DataSource, maintenance: DataSource, child: ChildProcess | undefined;
  let created = false, api = '', admin: Actor;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R11 requires local development PostgreSQL');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() });
    await maintenance.initialize(); await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`; db = new DataSource({ ...applicationDataSource.options, url: url.toString() });
    await db.initialize(); await db.runMigrations();
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, ['dist/r11/main.js'], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret, SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', CORS_ORIGIN: 'http://localhost:3000' } });
    for (let i = 0; i < 250; i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated R11 API first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor('ADMIN'); return; }
      await delay(100);
    }
    throw new Error('R11 readiness timeout');
  }, 40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r11_push_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  }, 15_000);
  async function actor(role = 'EMPLOYEE'): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r11-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [u.id, role]);
    const [e] = await db.query<Array<{ id: string }>>('INSERT INTO employees(employee_code,full_name,user_id) VALUES($1,$2,$3) RETURNING id', [randomUUID().slice(0, 28), label, u.id]);
    const deviceId = randomUUID();
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [u.id, deviceId, label]);
    return { id: u.id, employeeId: e.id, sid: s.id, deviceId, token: await jwt.signAsync({ sub: u.id, sid: s.id, roles: ['ADMIN'] }, { expiresIn: 900 }) };
  }
  async function call<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, person = admin): Promise<{ status: number; body: T }> {
    const r = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${person.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const raw = await r.text(); return { status: r.status, body: (r.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : {}) as T };
  }
  async function draft(extra = {}): Promise<Message> {
    const r = await call<Message>(base, 'POST', { title: label, body: `${label}\nChỉ thử nghiệm, không phải thông báo thật.`, audienceType: 'ALL', requiresAcknowledgement: true, ...extra }); expect(r.status).toBe(201); return r.body;
  }
  const publish = (m: Message): Promise<{ status: number; body: Message }> => call<Message>(`${base}/${m.id}/status`, 'PATCH', { status: 'PUBLISHED' });
  const mine = (p: Actor): Promise<{ status: number; body: Message[] }> => call<Message[]>(`${base}/mine`, 'GET', undefined, p);
  async function organization(): Promise<{ department: string; branch: string }> {
    const [d] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const [b] = await db.query<Array<{ id: string }>>('INSERT INTO branches(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    return { department: d.id, branch: b.id };
  }
  async function assignment(p: Actor, o: Awaited<ReturnType<typeof organization>>, from = '2020-01-01', to: string | null = null): Promise<void> {
    await db.query('INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from,effective_to) VALUES($1,$2,$3,false,$4,$5)', [p.employeeId, o.department, o.branch, from, to]);
  }
  it('individual draft is private, publication preserves Unicode and only the recipient can read/ack', async () => {
    const owner = await actor(), other = await actor(), m = await draft({ audienceType: 'EMPLOYEE', employeeId: owner.employeeId });
    expect((await mine(owner)).body.some(x => x.id === m.id)).toBe(false);
    expect((await publish(m)).status).toBe(200);
    const inbox = (await mine(owner)).body.find(x => x.id === m.id); expect(inbox?.body).toContain('Thông báo tiếng Việt'); expect(inbox?.readAt).toBeNull();
    expect((await mine(other)).body.some(x => x.id === m.id)).toBe(false);
    expect((await call(`${base}/${m.id}/read`, 'POST', undefined, other)).status).toBe(404);
    expect((await call(`${base}/${m.id}/acknowledge`, 'POST', undefined, other)).status).toBe(404);
  });
  it('department snapshot includes active primary/secondary bounded assignments, excludes future/expired ones and deduplicates people', async () => {
    const o = await organization(), people = await Promise.all([1, 2, 3, 4].map(() => actor()));
    await assignment(people[0], o); await assignment(people[0], o, '2020-02-01');
    await assignment(people[1], o, '2020-01-01', '2099-01-01');
    await assignment(people[2], o, '2099-01-01'); await assignment(people[3], o, '2020-01-01', '2020-01-02');
    const m = await draft({ audienceType: 'DEPARTMENT', departmentId: o.department }); expect((await publish(m)).status).toBe(200);
    const recipients = await call<Array<{ employeeId: string }>>(`${base}/${m.id}/recipients`);
    expect(recipients.body.map(r => r.employeeId).sort()).toEqual([people[0].employeeId, people[1].employeeId].sort());
  });
  it('company publication freezes active employee recipients; later employees do not inherit old announcements', async () => {
    const active = await actor(), inactive = await actor();
    await db.query('UPDATE employees SET is_active=false,employment_end_date=current_date,employment_status_reason=$2,status_changed_at=now(),status_changed_by=$3 WHERE id=$1', [inactive.employeeId, label, admin.id]);
    const m = await draft(); expect((await publish(m)).status).toBe(200);
    expect((await mine(active)).body.some(x => x.id === m.id)).toBe(true);
    const late = await actor(); expect((await mine(late)).body.some(x => x.id === m.id)).toBe(false);
    const recipients = await call<Array<{ employeeId: string }>>(`${base}/${m.id}/recipients`); expect(recipients.body.some(r => r.employeeId === inactive.employeeId)).toBe(false);
  });
  it('serializes read/ack retries with stable timestamps; reading does not acknowledge and list does not mark read', async () => {
    const owner = await actor(), m = await draft({ audienceType: 'EMPLOYEE', employeeId: owner.employeeId }); await publish(m);
    const read = await call<Message>(`${base}/${m.id}/read`, 'POST', undefined, owner); expect(read.body.acknowledgedAt).toBeNull();
    const results = await Promise.all([1, 2, 3].map(() => call<Message>(`${base}/${m.id}/acknowledge`, 'POST', undefined, owner)));
    expect(results.every(r => r.status === 201)).toBe(true); expect(new Set(results.map(r => r.body.acknowledgedAt)).size).toBe(1); expect(results[0].body.readAt).toBe(read.body.readAt);
    const ordinary = await draft({ audienceType: 'EMPLOYEE', employeeId: owner.employeeId, requiresAcknowledgement: false }); await publish(ordinary);
    expect((await call(`${base}/${ordinary.id}/acknowledge`, 'POST', undefined, owner)).status).toBe(409);
  });
  it('withdrawal waits for a read already in progress, then refuses further read/ack and retains the receipt', async () => {
    const owner = await actor(), m = await draft({ audienceType: 'EMPLOYEE', employeeId: owner.employeeId }); await publish(m);
    const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    await runner.query('SELECT employee_id FROM announcement_recipients WHERE announcement_id=$1 FOR UPDATE', [m.id]);
    const pending = call(`${base}/${m.id}/read`, 'POST', undefined, owner); await delay(150);
    let done = false; const withdrawal = call(`${base}/${m.id}/status`, 'PATCH', { status: 'WITHDRAWN', reason: label }).then(r => { done = true; return r; });
    try { await delay(250); expect(done).toBe(false); }
    finally { await runner.commitTransaction(); await runner.release(); await Promise.all([pending, withdrawal]); }
    expect((await call(`${base}/${m.id}/read`, 'POST', undefined, owner)).status).toBe(404);
    expect((await call(`${base}/${m.id}/acknowledge`, 'POST', undefined, owner)).status).toBe(409);
    expect((await mine(owner)).body.some(x => x.id === m.id)).toBe(false);
    expect((await call<Array<{ readAt: string | null }>>(`${base}/${m.id}/recipients`)).body[0].readAt).toBeTruthy();
  });
  it('rechecks a department deactivated after draft before publication', async () => {
    const o = await organization(), owner = await actor(); await assignment(owner, o);
    const m = await draft({ audienceType: 'DEPARTMENT', departmentId: o.department });
    await db.query('UPDATE departments SET is_active=false WHERE id=$1', [o.department]);
    expect((await publish(m)).status).toBe(400); expect((await mine(owner)).body.some(x => x.id === m.id)).toBe(false);
  });
  it('denies non-admin management even with forged ADMIN token claims; validates UUID/trim/null inputs', async () => {
    const owner = await actor(), m = await draft({ audienceType: 'EMPLOYEE', employeeId: owner.employeeId });
    for (const [path, method, body] of [[base, 'POST', { title: label, body: label, audienceType: 'ALL', requiresAcknowledgement: false }], [base, 'GET', undefined], [`${base}/${m.id}`, 'PATCH', { title: label }], [`${base}/${m.id}/status`, 'PATCH', { status: 'PUBLISHED' }], [`${base}/${m.id}/recipients`, 'GET', undefined], [`${base}/${m.id}/history`, 'GET', undefined], [`${base}/${m.id}/push/retry`, 'POST', undefined]] as const) expect((await call(path, method, body, owner)).status).toBe(403);
    for (const body of [{ title: '   ' }, { body: '   ' }, { title: null }, { body: null }, { audienceType: null }, { requiresAcknowledgement: null }]) expect((await call(`${base}/${m.id}`, 'PATCH', body)).status).toBe(400);
    for (const suffix of ['read', 'acknowledge', 'push/retry']) expect((await call(`${base}/not-uuid/${suffix}`, 'POST')).status).toBe(400);
  });
  it('only current authenticated Mobile session can register its own device, token rotations stay single and revoked sessions fail', async () => {
    const owner = await actor(), fake = `R11_TEST_FAKE_TOKEN_${randomUUID()}`;
    const payload = { deviceId: owner.deviceId, token: fake, platform: 'ANDROID' };
    const o = await organization(); await assignment(owner, o);
    // PQ2 permits one Web + one Mobile only with a live management grant.
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,department_id,appointment_type,valid_from,reason,created_by) VALUES($1,'DEPARTMENT_HEAD',$2,'OFFICIAL',now()-interval '1 day',$3,$4)`, [owner.id, o.department, label, admin.id]);
    const [web] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'WEB',now()+interval '1 day','SKIPPED') RETURNING id`, [owner.id, randomUUID(), label]);
    const webActor = { ...owner, token: await jwt.signAsync({ sub: owner.id, sid: web.id, roles: ['ADMIN'] }, { expiresIn: 900 }) };
    expect((await call(`${base}/push-devices`, 'POST', payload, webActor)).status).toBe(403);
    expect((await call(`${base}/push-devices`, 'POST', { ...payload, deviceId: randomUUID() }, owner)).status).toBe(403);
    expect((await call(`${base}/push-devices`, 'POST', payload, owner)).status).toBe(201);
    expect((await call(`${base}/push-devices`, 'POST', { ...payload, token: fake + '_ROTATED' }, owner)).status).toBe(201);
    expect(await db.query('SELECT id FROM push_device_tokens WHERE user_id=$1', [owner.id])).toHaveLength(1);
    await db.query('UPDATE auth_sessions SET revoked_at=now(),revoke_reason=$2 WHERE id=$1', [owner.sid, 'R11_TEST_REVOKED']);
    expect((await call(`${base}/push-devices`, 'POST', payload, owner)).status).toBe(401);
  });
  it('concurrent reuse of one token across two accounts does not cause 500 or leave token ownership split', async () => {
    const people = [await actor(), await actor()], token = `R11_TEST_FAKE_TOKEN_${randomUUID()}`;
    const results = await Promise.all(people.map(p => call(`${base}/push-devices`, 'POST', { deviceId: p.deviceId, platform: 'ANDROID', token }, p)));
    expect(results.map(r => r.status)).toEqual([201, 201]); expect(await db.query('SELECT id FROM push_device_tokens WHERE token=$1', [token])).toHaveLength(1);
  });
  it('publication race creates one snapshot/audit, disabled push/retry preserves inbox and read state', async () => {
    const owner = await actor(), m = await draft({ audienceType: 'EMPLOYEE', employeeId: owner.employeeId });
    const results = await Promise.all([1, 2].map(() => publish(m))); expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const [recipient] = await db.query<Array<{ status: string; failure: string; attempts: number }>>('SELECT push_status status,push_failure_code failure,push_attempt_count attempts FROM announcement_recipients WHERE announcement_id=$1', [m.id]); expect(recipient).toEqual({ status: 'SKIPPED', failure: 'PUSH_NOT_CONFIGURED', attempts: 1 });
    expect((await call(`${base}/${m.id}/push/retry`, 'POST')).status).toBe(201);
    expect((await mine(owner)).body.filter(x => x.id === m.id)).toHaveLength(1); expect((await mine(owner)).body.find(x => x.id === m.id)?.readAt).toBeNull();
    expect(await db.query("SELECT id FROM configuration_audit_logs WHERE resource_id=$1 AND action='PUBLISHED'", [m.id])).toHaveLength(1);
  });
});
