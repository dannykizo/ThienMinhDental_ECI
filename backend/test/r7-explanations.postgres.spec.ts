import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource, type QueryRunner } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface Actor { id: string; employeeId: string; token: string }
interface RequestRow { id: string; routeVersion: number; status: string; approvalStage: string; confirmedBy: string | null; confirmedAt: string | null; reviewedBy: string | null; decisionMethod: string | null }
interface Layout { admin: Actor; owner: Actor; leader: Actor; head: Actor; other: Actor; teamId: string; departmentId: string; leaderGrant: string; headGrant: string; date: string }
const label = 'R7 development-only acceptance';
const base = '/attendance/explanations';
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=', 'base64');

// Explicit opt-in; all accounts, tokens, photos and mutations belong to an isolated local DB.
describe.skipIf(process.env.R7_POSTGRES_TEST !== '1')('R7 explanations and adjustments — isolated PostgreSQL / real HTTP', () => {
  const name = `r7_explanations_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let maintenance: DataSource, db: DataSource, created = false, child: ChildProcess | undefined;
  let api = '', storage = '', monthIndex = 0;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R7 requires local development DB');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() }); await db.initialize(); await db.runMigrations();
    storage = await mkdtemp(join(tmpdir(), 'r7-explanation-evidence-'));
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done, reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R7_API_ENTRY ?? 'dist/r7/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret, EVIDENCE_STORAGE_DIR: storage,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000',
    } });
    for (let i = 0; i < 250; i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated R7 API first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) return;
      await delay(100);
    }
    throw new Error('R7 API readiness timeout');
  }, 40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r7_explanations_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (storage && dirname(resolve(storage)) === resolve(tmpdir()) && basename(storage).startsWith('r7-explanation-evidence-')) await rm(storage, { recursive: true, force: true });
  }, 15_000);
  async function call<T = Record<string, unknown>>(p: Actor, path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: T }> {
    const r = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${p.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    return { status: r.status, body: await r.json() as T };
  }
  async function actor(admin = false): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r7-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [u.id, admin ? 'ADMIN' : 'EMPLOYEE']);
    const [e] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id) VALUES($1,$2,$3) RETURNING id`, [randomUUID().slice(0, 28), label, u.id]);
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [u.id, randomUUID(), label]);
    return { id: u.id, employeeId: e.id, token: await jwt.signAsync({ sub: u.id, sid: s.id, roles: ['ADMIN'] }, { expiresIn: 900 }) };
  }
  async function grant(x: Layout, person: Actor, head = false): Promise<string> {
    const r = await call<{ id: string }>(x.admin, '/organization/grants', 'POST', { employeeId: person.employeeId, roleCode: head ? 'DEPARTMENT_HEAD' : 'TEAM_LEADER', ...(head ? { departmentId: x.departmentId } : { teamId: x.teamId }), appointmentType: 'OFFICIAL', validFrom: '2020-01-01T00:00:00Z', reason: label }); expect(r.status).toBe(201); return r.body.id;
  }
  async function layout(): Promise<Layout> {
    const admin = await actor(true), owner = await actor(), leader = await actor(), head = await actor(), other = await actor();
    const [d] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const [b] = await db.query<Array<{ id: string }>>('INSERT INTO branches(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const team = await call<{ id: string }>(admin, '/organization/teams', 'POST', { departmentId: d.id, code: randomUUID().slice(0, 28), name: label }); expect(team.status).toBe(201);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`, [owner.employeeId, d.id, b.id]);
    expect((await call(admin, `/organization/teams/${team.body.id}/members`, 'POST', { employeeId: owner.employeeId })).status).toBe(201);
    const date = new Date(Date.UTC(2024, monthIndex++, 9)).toISOString().slice(0, 10);
    const x = { admin, owner, leader, head, other, teamId: team.body.id, departmentId: d.id, leaderGrant: '', headGrant: '', date };
    x.leaderGrant = await grant(x, leader); x.headGrant = await grant(x, head, true); return x;
  }
  const route = (x: Layout, version = 0): object => ({ teamId: x.teamId, leaderUserId: x.leader.id, headUserId: x.head.id, expectedVersion: version, reason: label });
  async function submit(x: Layout, routed = true, extra = {}): Promise<RequestRow> {
    if (routed) expect((await call(x.admin, `${base}/routes/${x.owner.employeeId}`, 'PUT', route(x))).status).toBe(200);
    const r = await call<RequestRow>(x.owner, `${base}/mine`, 'POST', { workDate: x.date, issueType: 'OTHER', responseText: label, submissionId: randomUUID(), ...extra }); expect(r.status).toBe(201); return r.body;
  }
  async function confirm(x: Layout, item: RequestRow): Promise<RequestRow> {
    const r = await call<RequestRow>(x.leader, `${base}/${item.id}/confirm`, 'PATCH', { expectedVersion: item.routeVersion, confirmationNote: label }); expect(r.status).toBe(200); return r.body;
  }
  async function upload(p: Actor, id = randomUUID(), bytes = photo, mime = 'image/png'): Promise<{ status: number; reference: string }> {
    const form = new FormData(); form.set('evidenceId', id); form.set('file', new Blob([bytes], { type: mime }), 'development-only.png');
    const r = await fetch(`${api}/attendance/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${p.token}` }, body: form, signal: AbortSignal.timeout(10_000) });
    return { status: r.status, reference: ((await r.json()) as { reference: string }).reference };
  }
  const evidence = (p: Actor, reference: string): Promise<Response> => fetch(`${api}${reference.replace(/^\/api/, '')}`, { headers: { Authorization: `Bearer ${p.token}` }, signal: AbortSignal.timeout(10_000) });
  const decision = (p: Actor, item: RequestRow, extra = {}): ReturnType<typeof call<RequestRow>> => call<RequestRow>(p, `${base}/${item.id}/review`, 'PATCH', { expectedVersion: item.routeVersion, status: 'APPROVED', ...extra });
  const audit = (id: string): Promise<Array<{ action: string }>> => db.query("SELECT action FROM configuration_audit_logs WHERE resource_type='ATTENDANCE_EXPLANATION' AND resource_id=$1 ORDER BY created_at", [id]);

  it('requires distinct assigned actors in order; healthy routing denies Admin fallback and forged JWT role claims', async () => {
    const x = await layout(), item = await submit(x);
    for (const p of [x.owner, x.other, x.head, x.admin]) expect((await call(p, `${base}/${item.id}/confirm`, 'PATCH', { expectedVersion: item.routeVersion })).status).toBe(403);
    for (const p of [x.owner, x.other, x.head, x.leader]) expect((await decision(p, item)).status).toBe(403);
    expect((await decision(x.admin, item, { adminOverrideReason: label })).status).toBe(403);
    const next = await confirm(x, item), final = await decision(x.head, next);
    expect(final.status).toBe(200); expect(final.body).toMatchObject({ status: 'APPROVED', confirmedBy: x.leader.id, reviewedBy: x.head.id, decisionMethod: 'ROUTED', approvalStage: 'COMPLETED' });
    expect((await db.query<Array<{ id: string }>>('SELECT id FROM attendance_adjustments WHERE employee_id=$1', [x.owner.employeeId])).length).toBe(0);
    // SUBMIT/WORKFLOW_START have the same transaction timestamp; UUID order is not chronology.
    expect((await audit(item.id)).map(r => r.action).sort()).toEqual(['SUBMIT', 'WORKFLOW_START', 'LEADER_CONFIRM', 'HEAD_REVIEW'].sort());
    const messages = await db.query<Array<{ body: string }>>('SELECT a.body FROM announcements a JOIN announcement_recipients r ON r.announcement_id=a.id WHERE r.employee_id=$1', [x.owner.employeeId]);
    expect(messages.filter(r => r.body.includes(`Đã duyệt bởi ${label}`))).toHaveLength(1);
  });
  it('serializes simultaneous Leader confirmations and conflicting Head decisions without duplicate audits/inbox', async () => {
    const x = await layout(), item = await submit(x);
    const confirmations = await Promise.all([1, 2].map(() => call<RequestRow>(x.leader, `${base}/${item.id}/confirm`, 'PATCH', { expectedVersion: item.routeVersion })));
    expect(confirmations.map(r => r.status).sort()).toEqual([200, 409]);
    const next = confirmations.find(r => r.status === 200)!.body;
    const finals = await Promise.all([decision(x.head, next), decision(x.head, next, { status: 'REJECTED', reviewNote: label })]);
    expect(finals.map(r => r.status).sort()).toEqual([200, 409]);
    const done = finals.find(r => r.status === 200)!.body;
    expect((await decision(x.head, done)).status).toBe(403);
    expect((await audit(item.id)).filter(r => r.action === 'LEADER_CONFIRM')).toHaveLength(1);
    expect((await audit(item.id)).filter(r => r.action === 'HEAD_REVIEW')).toHaveLength(1);
    const [inbox] = await db.query<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM announcement_recipients r JOIN announcements a ON a.id=r.announcement_id WHERE r.employee_id=$1 AND a.title IN ('Giải trình đã được duyệt','Giải trình bị từ chối')`, [x.owner.employeeId]); expect(inbox.count).toBe(1);
  });
  it('allows a reasoned Admin fallback only on broken routing, never self-approval, and keeps actual actor/audit', async () => {
    const x = await layout(), item = await submit(x, false);
    expect(item.approvalStage).toBe('WAITING_ROUTING');
    expect((await decision(x.admin, item)).status).toBe(403);
    expect((await decision(x.admin, item, { adminOverrideReason: '     ' })).status).toBe(400);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=\'ADMIN\'', [x.owner.id]);
    expect((await decision(x.owner, item, { adminOverrideReason: label })).status).toBe(403);
    const results = await Promise.all([1, 2].map(() => decision(x.admin, item, { adminOverrideReason: label })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(results.find(r => r.status === 200)!.body).toMatchObject({ confirmedBy: null, reviewedBy: x.admin.id, decisionMethod: 'ADMIN_FALLBACK', adminOverrideReason: label });
    expect((await audit(item.id)).filter(r => r.action === 'ADMIN_FALLBACK_REVIEW')).toHaveLength(1);
  });
  it('rechecks revoked/expired/inactive scope and preserves completed confirmation for fallback', async () => {
    const x = await layout(), item = await confirm(x, await submit(x));
    expect((await call(x.admin, `/organization/grants/${x.headGrant}/revoke`, 'POST', { reason: label })).status).toBe(201);
    expect((await decision(x.head, item)).status).toBe(403);
    const done = await decision(x.admin, item, { adminOverrideReason: label }); expect(done.status).toBe(200);
    expect(done.body.confirmedBy).toBe(x.leader.id); expect(done.body.confirmedAt).toBe(item.confirmedAt);
    for (const change of ["valid_until=now()-interval '1 second'", 'valid_from=now()+interval \'1 day\'']) {
      const y = await layout(), pending = await submit(y); await db.query(`UPDATE organization_management_grants SET ${change} WHERE id=$1`, [y.leaderGrant]);
      expect((await call(y.leader, `${base}/${pending.id}/confirm`, 'PATCH', { expectedVersion: pending.routeVersion })).status).toBe(403);
      expect((await decision(y.admin, pending, { adminOverrideReason: label })).status).toBe(200);
    }
    const y = await layout(), pending = await submit(y); await db.query('UPDATE organization_teams SET is_active=false WHERE id=$1', [y.teamId]);
    expect((await call(y.leader, `${base}/${pending.id}/confirm`, 'PATCH', { expectedVersion: pending.routeVersion })).status).toBe(403);
    expect((await decision(y.admin, pending, { adminOverrideReason: label })).status).toBe(200);
  });
  it('reroutes unfinished Head immediately, retains confirmation, and removes old reviewer history/photo access', async () => {
    const x = await layout(), image = await upload(x.owner); expect(image.status).toBe(201);
    const item = await confirm(x, await submit(x, true, { evidenceImageReference: image.reference }));
    await grant(x, x.other, true);
    expect((await call(x.admin, `${base}/${item.id}/reroute`, 'PATCH', { ...route(x, item.routeVersion), headUserId: x.other.id })).status).toBe(200);
    expect((await decision(x.head, item)).status).toBe(409);
    expect((await call(x.head, `${base}/${item.id}/history`)).status).toBe(404);
    expect((await evidence(x.head, image.reference)).status).toBe(404);
    expect((await evidence(x.other, image.reference)).status).toBe(200);
    const [saved] = await db.query<Array<{ confirmed_by: string; head_user_id: string }>>('SELECT confirmed_by,head_user_id FROM attendance_explanation_requests WHERE id=$1', [item.id]); expect(saved).toMatchObject({ confirmed_by: x.leader.id, head_user_id: x.other.id });
  });
  it('serializes a reroute racing confirmation; stale actor/version cannot perform the next step', async () => {
    const x = await layout(), item = await submit(x); await grant(x,x.other);
    const results = await Promise.all([
      call<RequestRow>(x.leader,`${base}/${item.id}/confirm`,'PATCH',{expectedVersion:item.routeVersion}),
      call<RequestRow>(x.admin,`${base}/${item.id}/reroute`,'PATCH',{...route(x,item.routeVersion),leaderUserId:x.other.id}),
    ]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await call(x.leader,`${base}/${item.id}/confirm`,'PATCH',{expectedVersion:item.routeVersion})).status).toBe(409);
    expect((await audit(item.id)).filter(r=>['LEADER_CONFIRM','ADMIN_REROUTE'].includes(r.action))).toHaveLength(1);
  });
  it('applies default route changes to unfinished steps but cannot rewrite a completed confirmation', async () => {
    const x = await layout(), item = await confirm(x,await submit(x)); await grant(x,x.other,true);
    const changed = await call(x.admin,`${base}/routes/${x.owner.employeeId}`,'PUT',{...route(x,1),headUserId:x.other.id});
    expect(changed.status).toBe(200); expect(changed.body.updatedPending).toBe(1);
    expect((await decision(x.head,item)).status).toBe(409);
    const [saved] = await db.query<Array<{confirmed_by:string;head_user_id:string;route_version:number}>>('SELECT confirmed_by,head_user_id,route_version FROM attendance_explanation_requests WHERE id=$1',[item.id]);
    expect(saved).toMatchObject({confirmed_by:x.leader.id,head_user_id:x.other.id,route_version:item.routeVersion+1});
    expect((await call(x.admin,`${base}/${item.id}/reroute`,'PATCH',{...route(x,saved.route_version),leaderUserId:x.other.id})).status).toBe(409);
    expect((await decision(x.other,{...item,routeVersion:saved.route_version})).status).toBe(200);
  });
  it('rejects owner/reviewer identity collisions and out-of-scope routes before applying anything', async () => {
    const x = await layout(); await grant(x,x.owner); await grant(x,x.owner,true);
    for (const extra of [{leaderUserId:x.owner.id},{headUserId:x.owner.id},{headUserId:x.leader.id},{headUserId:x.other.id}]) {
      expect((await call(x.admin,`${base}/routes/${x.owner.employeeId}`,'PUT',{...route(x),...extra})).status).toBe(400);
    }
    expect((await db.query<Array<{id:string}>>('SELECT employee_id AS id FROM attendance_explanation_routes WHERE employee_id=$1',[x.owner.employeeId]))).toHaveLength(0);
  });
  it('rolls decision and inbox back together when audit persistence fails', async () => {
    const x = await layout(), item = await confirm(x,await submit(x));
    // Failure injection is confined to this test DB and this exact fixture request.
    await db.query(`CREATE FUNCTION r7_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='${item.id}'::uuid AND NEW.action='HEAD_REVIEW' THEN RAISE EXCEPTION 'R7 injected audit failure'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER r7_reject_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r7_reject_audit()');
    try {
      expect((await decision(x.head,item)).status).toBe(500);
      const [saved] = await db.query<Array<{status:string;route_version:number;reviewed_by:string|null}>>('SELECT status,route_version,reviewed_by FROM attendance_explanation_requests WHERE id=$1',[item.id]);
      expect(saved).toMatchObject({status:'SUBMITTED',route_version:item.routeVersion,reviewed_by:null});
      expect((await audit(item.id)).some(r=>r.action==='HEAD_REVIEW')).toBe(false);
      expect((await db.query<Array<{id:string}>>(`SELECT a.id FROM announcements a JOIN announcement_recipients r ON r.announcement_id=a.id WHERE r.employee_id=$1 AND a.title='Giải trình đã được duyệt'`,[x.owner.employeeId]))).toHaveLength(0);
    } finally { await db.query('DROP TRIGGER r7_reject_audit ON configuration_audit_logs'); await db.query('DROP FUNCTION r7_reject_audit()'); }
    expect((await decision(x.head,item)).status).toBe(200);
  });
  it('keeps evidence private/immutable, rejects foreign ownership, forged reference, MIME and oversize bytes', async () => {
    const x = await layout(), evidenceId = randomUUID(), image = await upload(x.owner, evidenceId); expect(image.status).toBe(201);
    await submit(x, true, { evidenceImageReference: image.reference });
    for (const p of [x.owner, x.admin, x.leader, x.head]) expect((await evidence(p, image.reference)).status).toBe(200);
    expect((await evidence(x.other, image.reference)).status).toBe(404);
    expect((await fetch(`${api}${image.reference.replace(/^\/api/, '')}`)).status).toBe(401);
    expect((await upload(x.owner, evidenceId)).status).toBe(201);
    expect((await upload(x.owner, evidenceId, Buffer.concat([photo, Buffer.from('changed')]))).status).toBe(400);
    expect((await upload(x.other, evidenceId)).status).toBe(400);
    const body = { workDate: x.date, issueType: 'GPS_RISK', responseText: label, submissionId: randomUUID(), evidenceImageReference: image.reference };
    expect((await call(x.other, `${base}/mine`, 'POST', body)).status).toBe(400);
    expect((await call(x.owner, `${base}/mine`, 'POST', { ...body, evidenceImageReference: 'https://outside.invalid/image.png' })).status).toBe(400);
    expect((await upload(x.owner, randomUUID(), photo, 'image/jpeg')).status).toBe(400);
    expect((await upload(x.owner, randomUUID(), Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
  });
  it('makes simultaneous identical submissions idempotent, rejects changed payload and competing open submissions', async () => {
    const x = await layout(), payload = { workDate: x.date, issueType: 'OTHER', responseText: label, submissionId: randomUUID() };
    const same = await Promise.all([1, 2].map(() => call<RequestRow>(x.owner, `${base}/mine`, 'POST', payload)));
    expect(same.map(r => r.status)).toEqual([201, 201]); expect(same[0].body.id).toBe(same[1].body.id);
    expect((await call(x.owner, `${base}/mine`, 'POST', { ...payload, responseText: `${label} changed` })).status).toBe(409);
    expect((await call(x.owner, `${base}/mine`, 'POST', { ...payload, submissionId: randomUUID() })).status).toBe(409);
    expect((await audit(same[0].body.id)).filter(r => r.action === 'SUBMIT')).toHaveLength(1);
    const y = await layout(), competing = await Promise.all([1, 2].map(() => call(y.owner, `${base}/mine`, 'POST', { ...payload, workDate: y.date, submissionId: randomUUID() })));
    expect(competing.map(r => r.status).sort()).toEqual([201, 409]);
  });
  it('supports owner-only legacy response once; cannot directly decide REQUESTED or expired legacy requests', async () => {
    const x = await layout();
    const [old] = await db.query<Array<{ id: string }>>(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,status,source,request_note,requested_by,due_at) VALUES($1,$2,'OTHER','REQUESTED','ADMIN_REQUEST',$3,$4,now()+interval '1 day') RETURNING id`, [x.owner.employeeId,x.date,label,x.admin.id]);
    expect((await decision(x.admin, { id: old.id, routeVersion: 0 } as RequestRow, { adminOverrideReason: label })).status).toBe(403);
    expect((await call(x.other, `${base}/${old.id}/respond`, 'PATCH', { responseText: label })).status).toBe(404);
    const result = await call<RequestRow>(x.owner, `${base}/${old.id}/respond`, 'PATCH', { responseText: label }); expect(result.status).toBe(200);
    expect((await call(x.owner, `${base}/${old.id}/respond`, 'PATCH', { responseText: label })).status).toBe(409);
    expect((await audit(old.id)).filter(r => r.action === 'LEGACY_RESPOND')).toHaveLength(1);
    await db.query("UPDATE attendance_explanation_requests SET status='REQUESTED',due_at=now()-interval '1 day' WHERE id=$1", [old.id]);
    expect((await call(x.owner, `${base}/${old.id}/respond`, 'PATCH', { responseText: label })).status).toBe(409);
  });
  it('blocks submission, response, decision and adjustment in locked months', async () => {
    const x = await layout(), item = await submit(x);
    await db.query("UPDATE attendance_periods SET status='LOCKED' WHERE period_month=date_trunc('month',$1::date)::date", [x.date]);
    expect((await call(x.owner, `${base}/mine`, 'POST', { workDate:x.date,issueType:'GPS_RISK',responseText:label,submissionId:randomUUID() })).status).toBe(409);
    expect((await call(x.leader, `${base}/${item.id}/confirm`, 'PATCH', { expectedVersion:item.routeVersion })).status).toBe(409);
    expect((await call(x.admin, '/attendance/adjustments', 'POST', adjustment(x))).status).toBe(409);
    await db.query("UPDATE attendance_explanation_requests SET status='REQUESTED',source='ADMIN_REQUEST',submission_id=NULL WHERE id=$1",[item.id]);
    expect((await call(x.owner,`${base}/${item.id}/respond`,'PATCH',{responseText:label})).status).toBe(409);
  });
  const adjustment = (x: Layout, newValue = 'PRESENT', reason = label): object => ({ employeeId:x.owner.employeeId,workDate:x.date,fieldName:'DAY_STATUS',newValue,reason });
  it('allows only Admin adjustments and captures the correct previous value, actor, reason and timestamp', async () => {
    const x = await layout();
    for (const p of [x.owner,x.leader,x.head]) expect((await call(p,'/attendance/adjustments','POST',adjustment(x))).status).toBe(403);
    expect((await call(x.admin,'/attendance/adjustments','POST',adjustment(x,'INVALID'))).status).toBe(400);
    expect((await call(x.admin,'/attendance/adjustments','POST',{...adjustment(x),workDate:'2026-02-30'})).status).toBe(400);
    const first = await call(x.admin,'/attendance/adjustments','POST',adjustment(x)); expect(first.status).toBe(201);
    const next = await call(x.admin,'/attendance/adjustments','POST',adjustment(x,'LEAVE'));
    expect(next.status).toBe(201); expect(next.body).toMatchObject({ oldValue:'PRESENT',newValue:'LEAVE',adjustedBy:x.admin.id,reason:label }); expect(next.body.createdAt).toBeTruthy();
  });
  it('rejects whitespace-only adjustment reasons without writes', async () => {
    const x = await layout(); expect((await call(x.admin,'/attendance/adjustments','POST',adjustment(x,'PRESENT','     '))).status).toBe(400);
    expect((await db.query<Array<{ id: string }>>('SELECT id FROM attendance_adjustments WHERE employee_id=$1',[x.owner.employeeId])).length).toBe(0);
  });
  async function waitBlocked(runner: QueryRunner): Promise<void> {
    for (let i=0;i<150;i++) {
      const [row] = await runner.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type=\'Lock\') AS waiting') as Array<{ waiting: boolean }>;
      if (row.waiting) return; await delay(20);
    }
    throw new Error('Expected deterministic transaction lock wait');
  }
  it('rejects adjustment racing a month lock, including months whose OPEN row did not exist', async () => {
    const x = await layout(), gate = db.createQueryRunner(); await gate.connect(); await gate.startTransaction();
    let pending: ReturnType<typeof call> | undefined;
    try {
      await gate.query("INSERT INTO attendance_periods(period_month,status) VALUES(date_trunc('month',$1::date)::date,'OPEN')",[x.date]);
      pending = call(x.admin,'/attendance/adjustments','POST',adjustment(x));
      await waitBlocked(gate);
      await gate.query("UPDATE attendance_periods SET status='LOCKED' WHERE period_month=date_trunc('month',$1::date)::date",[x.date]); await gate.commitTransaction();
      expect((await pending).status).toBe(409); expect((await db.query<Array<{ id: string }>>('SELECT id FROM attendance_adjustments WHERE employee_id=$1',[x.owner.employeeId])).length).toBe(0);
    } finally { if(gate.isTransactionActive) await gate.rollbackTransaction(); await gate.release(); if(pending) await pending; }
  });
  it('serializes simultaneous adjustments so each immutable old/new audit forms one chain', async () => {
    const x = await layout();
    const results = await Promise.all([call(x.admin,'/attendance/adjustments','POST',adjustment(x,'PRESENT')),call(x.admin,'/attendance/adjustments','POST',adjustment(x,'LEAVE'))]);
    expect(results.map(r=>r.status)).toEqual([201,201]);
    const first = results.find(r=>r.body.oldValue==='NOT_CHECKED_IN')!, second = results.find(r=>r.body.oldValue!=='NOT_CHECKED_IN')!;
    expect(first).toBeDefined(); expect(second).toBeDefined(); expect(second.body.oldValue).toBe(first.body.newValue);
  });
});
