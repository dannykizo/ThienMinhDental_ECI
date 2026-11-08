import 'reflect-metadata';
import { createHash, generateKeyPairSync, type KeyObject, randomUUID, sign } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

interface Actor { id: string; employeeId: string; token: string; privateKey: KeyObject }
interface Location { id: string; name: string; address: string; radiusMeters: number; accuracyThresholdMeters: number; branchId: string | null; isActive: boolean }
const label = 'R5 office location development-only acceptance';
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=', 'base64');

describe.skipIf(process.env.R5_POSTGRES_TEST !== '1')('R5 office locations — isolated PostgreSQL/API', () => {
  const name = `r5_locations_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let maintenance: DataSource, db: DataSource, child: ChildProcess | undefined, created = false;
  let api = '', storage = '', branch = '', otherBranch = '', department = '', admin: Actor;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R5 requires a local development DB');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() }); await db.initialize(); await db.runMigrations();
    storage = await mkdtemp(join(tmpdir(), 'r5-location-evidence-'));
    const rows = await db.query<Array<{ id: string }>>(`INSERT INTO branches(code,name) VALUES('R5-A',$1),('R5-B',$1) RETURNING id`, [label]);
    branch = rows[0].id; otherBranch = rows[1].id;
    const [d] = await db.query<Array<{ id: string }>>(`INSERT INTO departments(code,name) VALUES('R5',$1) RETURNING id`, [label]); department = d.id;
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done, reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R6_API_ENTRY ?? 'dist/main.js'], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret, EVIDENCE_STORAGE_DIR: storage,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000' } });
    for (let i = 0; i < 250; i++) {
      if (child.exitCode !== null) throw new Error('Build Backend before R5 acceptance');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor(RoleCode.Admin); return; }
      await delay(100);
    }
    throw new Error('R5 isolated API readiness timeout');
  }, 40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r5_locations_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (storage && dirname(storage) === tmpdir() && basename(storage).startsWith('r5-location-evidence-')) await rm(storage, { recursive: true, force: true });
  }, 15_000);
  async function actor(role: RoleCode = RoleCode.Employee): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r5-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [u.id, role]);
    const [e] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id,department_id) VALUES($1,$2,$3,$4) RETURNING id`, [randomUUID().slice(0, 28), label, u.id, department]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`, [e.id, branch, department]);
    const deviceId = randomUUID(), keys = generateKeyPairSync('ec',{namedCurve:'prime256v1'}), publicKey = keys.publicKey.export({type:'spki',format:'pem'}).toString();
    await db.query(`INSERT INTO attendance_devices(user_id,employee_id,device_id,device_name,public_key,fingerprint,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE')`,[u.id,e.id,deviceId,label,publicKey,createHash('sha256').update(publicKey).digest('hex')]);
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [u.id, deviceId, label]);
    return { id: u.id, employeeId: e.id, token: await jwt.signAsync({ sub: u.id, sid: s.id, roles: [RoleCode.Admin] }, { expiresIn: 900 }),privateKey:keys.privateKey };
  }
  async function call<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, who = admin): Promise<{ status: number; body: T }> {
    const r = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${who.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() as T };
  }
  function input(extra: Record<string, unknown> = {}): Record<string, unknown> { return { name: label, address: label, branchId: branch, latitude: 0, longitude: 0, radiusMeters: 100, accuracyThresholdMeters: 50, ...extra }; }
  async function location(extra: Record<string, unknown> = {}): Promise<Location> { const r = await call<Location>('/office-locations', 'POST', input(extra)); expect(r.status).toBe(201); return r.body; }
  const audit = (id: string): Promise<Array<{ old_value: Record<string, unknown> | null; new_value: Record<string, unknown>; created_by: string; action: string }>> => db.query(`SELECT old_value,new_value,created_by,action FROM configuration_audit_logs WHERE resource_id=$1 ORDER BY created_at,id`, [id]);
  async function attendance(p: Actor, latitude = 0, accuracyMeters: number | null = 5, longitude = 0): Promise<{ status: number; body: Record<string, unknown> }> {
    const gps = { latitude, longitude, accuracyMeters, attendanceType: 'OFFICE', mockLocationSignal: false };
    const c = await call<{ id: string }>('/attendance/check-in-captures', 'POST', gps, p);
    if (c.status !== 201) return c;
    const form = new FormData(); form.set('evidenceId', c.body.id); form.set('file', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'test.png');
    expect((await fetch(`${api}/attendance/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${p.token}` }, body: form })).status).toBe(201);
    const input = {...gps,eventType:'CHECK_IN',checkinCaptureId:c.body.id};
    const challenge = await call('/attendance/device-challenges','POST',input,p); expect(challenge.status).toBe(201);
    return call('/attendance/events', 'POST', { ...input,challengeId:challenge.body.id,signature:sign('sha256',Buffer.from(challenge.body.payload as string),p.privateKey).toString('base64') }, p);
  }
  async function isolateLocations(): Promise<void> { await db.query('UPDATE office_locations SET is_active=false'); }

  it('creates and lists numeric configuration with immutable actor audit', async () => {
    const l = await location();
    expect(l).toMatchObject({ radiusMeters: 100, accuracyThresholdMeters: 50, isActive: true, branchId: branch });
    const logs = await audit(l.id); expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'CREATE', old_value: null, created_by: admin.id, new_value: { name: label, radiusMeters: 100 } });
    expect((await call<Location[]>('/office-locations')).body.some(row => row.id === l.id)).toBe(true);
  });
  it('rejects invalid coordinates, out-of-range independent limits and non-numeric fields', async () => {
    for (const extra of [{ latitude: 91 }, { longitude: -181 }, { latitude: '0' }, { longitude: null }, { radiusMeters: 101 }, { radiusMeters: 0 }, { radiusMeters: 1.5 }, { accuracyThresholdMeters: 51 }, { accuracyThresholdMeters: 0 }, { accuracyThresholdMeters: 1.5 }]) expect((await call('/office-locations', 'POST', input(extra))).status, JSON.stringify(extra)).toBe(400);
  });
  it('rejects blank/oversized required text and null values without writing', async () => {
    const before = await db.query<Array<{ id: string }>>('SELECT id FROM office_locations');
    for (const extra of [{ name: '   ' }, { name: '' }, { address: '  ' }, { name: 'x'.repeat(121) }, { address: 'x'.repeat(301) }, { locationType: null }]) expect((await call('/office-locations', 'POST', input(extra))).status, JSON.stringify(extra)).toBe(400);
    expect(await db.query('SELECT id FROM office_locations')).toHaveLength(before.length);
  });
  it('rejects null partial updates; preserves omitted fields and complete before/after audit', async () => {
    const l = await location();
    for (const key of ['name', 'address', 'latitude', 'longitude', 'radiusMeters', 'accuracyThresholdMeters', 'isActive', 'locationType']) expect((await call(`/office-locations/${l.id}`, 'PATCH', { [key]: null })).status, key).toBe(400);
    const updated = await call<Location>(`/office-locations/${l.id}`, 'PATCH', { name: 'R5 updated' });
    expect(updated.status).toBe(200); expect(updated.body).toMatchObject({ name: 'R5 updated', address: label, radiusMeters: 100, branchId: branch });
    const logs = await audit(l.id); expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ old_value: { name: label, address: label }, new_value: { name: 'R5 updated', address: label } });
  });
  it('requires an active existing branch for office, allows shared external locations and type transitions', async () => {
    expect((await call('/office-locations', 'POST', input({ branchId: null }))).body.code).toBe('OFFICE_BRANCH_REQUIRED');
    expect((await call('/office-locations', 'POST', input({ branchId: randomUUID() }))).status).toBe(400);
    const l = await location({ branchId: null, locationType: 'EXTERNAL_WORKPLACE' });
    expect((await call(`/office-locations/${l.id}`, 'PATCH', { locationType: 'OFFICE' })).status).toBe(400);
    expect((await call(`/office-locations/${l.id}`, 'PATCH', { locationType: 'OFFICE', branchId: branch })).status).toBe(200);
    expect((await call(`/office-locations/${l.id}`, 'PATCH', { branchId: null })).status).toBe(400);
    expect((await call(`/office-locations/${l.id}`, 'PATCH', { branchId: null, locationType: 'EXTERNAL_WORKPLACE' })).status).toBe(200);
  });
  it('blocks references/reactivation to inactive branches; permits disabling and preserves history', async () => {
    const l = await location({ branchId: otherBranch });
    await db.query('UPDATE branches SET is_active=false WHERE id=$1', [otherBranch]);
    try {
      expect((await call('/office-locations', 'POST', input({ branchId: otherBranch }))).status).toBe(400);
      expect((await call(`/office-locations/${l.id}`, 'PATCH', { isActive: false })).status).toBe(200);
      expect((await call(`/office-locations/${l.id}`, 'PATCH', { isActive: true })).status).toBe(400);
      expect(await audit(l.id)).toHaveLength(2);
    } finally { await db.query('UPDATE branches SET is_active=true WHERE id=$1', [otherBranch]); }
  });
  it('checks live ADMIN permissions for listing, history, create and update despite forged JWT roles', async () => {
    const l = await location();
    for (const role of [RoleCode.Employee, RoleCode.Manager, RoleCode.ChiefAccountant, RoleCode.AreaManager]) {
      const p = await actor(role);
      for (const [path, method, body] of [['/office-locations', 'GET', undefined], ['/office-locations/history', 'GET', undefined], ['/office-locations', 'POST', input()], [`/office-locations/${l.id}`, 'PATCH', { isActive: false }]] as const) expect((await call(path, method, body, p)).status).toBe(403);
    }
    const unauthorized = await fetch(`${api}/office-locations`); expect(unauthorized.status).toBe(401);
    const p = await actor(RoleCode.Admin); await db.query('UPDATE users SET is_active=false WHERE id=$1', [p.id]);
    expect((await call('/office-locations', 'GET', undefined, p)).status).toBe(401);
  });
  it('returns 400/404 for unknown payload/invalid and missing UUID, without audit mutation', async () => {
    const l = await location(), before = await audit(l.id);
    expect((await call(`/office-locations/${l.id}`, 'PATCH', { employeeId: randomUUID() })).status).toBe(400);
    expect((await call('/office-locations/not-a-uuid', 'PATCH', { name: label })).status).toBe(400);
    expect((await call(`/office-locations/${randomUUID()}`, 'PATCH', { name: label })).status).toBe(404);
    expect(await audit(l.id)).toEqual(before);
  });
  it('does not promote scoped Head/Leader grants into location administration', async () => {
    const team = await call<{ id: string }>('/organization/teams', 'POST', { departmentId: department, code: 'R5-TEAM', name: label }); expect(team.status).toBe(201);
    const l = await location();
    for (const scope of [{ roleCode: 'DEPARTMENT_HEAD', departmentId: department }, { roleCode: 'TEAM_LEADER', teamId: team.body.id }]) {
      const p = await actor();
      expect((await call('/organization/grants', 'POST', { employeeId: p.employeeId, ...scope, appointmentType: 'OFFICIAL', validFrom: '2020-01-01T00:00:00Z', reason: label })).status).toBe(201);
      expect((await call('/office-locations', 'GET', undefined, p)).status).toBe(403);
      expect((await call('/office-locations/history', 'GET', undefined, p)).status).toBe(403);
      expect((await call(`/office-locations/${l.id}`, 'PATCH', { isActive: false }, p)).status).toBe(403);
    }
  });
  it('serializes concurrent partial edits and preserves the audit chain without lost fields', async () => {
    const l = await location(), runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    await runner.query('SELECT id FROM office_locations WHERE id=$1 FOR UPDATE', [l.id]);
    const first = call(`/office-locations/${l.id}`, 'PATCH', { name: 'R5 concurrent name' });
    const second = call(`/office-locations/${l.id}`, 'PATCH', { address: 'R5 concurrent address' });
    await delay(250); await runner.commitTransaction(); await runner.release();
    expect((await Promise.all([first, second])).map(r => r.status)).toEqual([200, 200]);
    const rows = (await call<Location[]>('/office-locations')).body; expect(rows.find(r => r.id === l.id)).toMatchObject({ name: 'R5 concurrent name', address: 'R5 concurrent address' });
    const logs = await audit(l.id); expect(logs).toHaveLength(3);
    // PostgreSQL transaction timestamps do not define commit order: identify the final audit by snapshot.
    const final = logs.find(r => r.new_value.name === 'R5 concurrent name' && r.new_value.address === 'R5 concurrent address');
    expect(final).toBeDefined();
    expect(logs.some(r => r !== final && r.new_value.name === final?.old_value?.name && r.new_value.address === final?.old_value?.address)).toBe(true);
  });
  it('selects nearest eligible active branch; ignores foreign/inactive locations and grants no geofence bypass', async () => {
    await isolateLocations(); const p = await actor();
    const valid = await location({ latitude: 0.0005 });
    await location({ branchId: otherBranch });
    const off = await location(); await call(`/office-locations/${off.id}`, 'PATCH', { isActive: false });
    const result = await attendance(p); expect(result.status).toBe(201); expect(result.body.officeLocationId).toBe(valid.id); expect(result.body.riskFlags).toEqual([]);
  });
  it('uses shared external locations and secondary current branch assignments', async () => {
    await isolateLocations(); const p = await actor(), shared = await location({ locationType: 'EXTERNAL_WORKPLACE', branchId: null });
    expect((await attendance(p)).body.officeLocationId).toBe(shared.id);
    await isolateLocations(); const q = await actor(), secondary = await location({ branchId: otherBranch });
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,false,'2020-01-01')`, [q.employeeId, otherBranch, department]);
    expect((await attendance(q)).body.officeLocationId).toBe(secondary.id);
  });
  it('does not use expired assignments or inactive branches, and rolls back an unconfigured event', async () => {
    await isolateLocations(); await location({ branchId: otherBranch }); const p = await actor();
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from,effective_to) VALUES($1,$2,$3,false,'2020-01-01','2020-12-31')`, [p.employeeId, otherBranch, department]);
    expect((await attendance(p)).body.code).toBe('OFFICE_LOCATION_NOT_CONFIGURED');
    const l = await location(); await db.query('UPDATE branches SET is_active=false WHERE id=$1', [branch]);
    try { expect((await attendance(await actor())).body.code).toBe('OFFICE_LOCATION_NOT_CONFIGURED'); }
    finally { await db.query('UPDATE branches SET is_active=true WHERE id=$1', [branch]); }
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1', [p.employeeId])).toEqual([]);
    expect(l.isActive).toBe(true);
  });
  it.each([[99.9, 50, []], [100.1, 50, ['OUTSIDE_GEOFENCE']], [99.9, 50.1, ['LOW_ACCURACY']], [100.1, 50.1, ['OUTSIDE_GEOFENCE', 'LOW_ACCURACY']]])('keeps distance %s and accuracy %s as independent risk criteria', async (distance, accuracy, flags) => {
    await isolateLocations(); await location();
    const p = await actor(), result = await attendance(p, Number(distance) / 6371000 * 180 / Math.PI, Number(accuracy));
    expect(result.status).toBe(flags.length ? 403 : 201); expect(result.body.riskFlags).toEqual(flags);
  });
  it('rejects missing GPS accuracy without creating attendance', async () => {
    const p = await actor(); expect((await attendance(p, 0, null)).status).toBe(400);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1', [p.employeeId])).toEqual([]);
  });
  it('blocks an antipodal sample as outside rather than storing a NaN distance as safe', async () => {
    await isolateLocations(); await location({ latitude: 2.500000000000001 });
    const p = await actor(), result = await attendance(p, -2.500000000000001, 5, 180);
    expect(result.status).toBe(403); expect(result.body.riskFlags).toEqual(['OUTSIDE_GEOFENCE']);
    expect(await db.query('SELECT id FROM attendance_events WHERE employee_id=$1',[p.employeeId])).toHaveLength(0);
  });
  it('configuration edits and deactivation do not rewrite previously recorded events', async () => {
    await isolateLocations(); const l = await location(), p = await actor(); await attendance(p);
    const before = await db.query<Array<Record<string, unknown>>>('SELECT * FROM attendance_events WHERE employee_id=$1', [p.employeeId]);
    expect((await call(`/office-locations/${l.id}`, 'PATCH', { latitude: 1, radiusMeters: 10, isActive: false })).status).toBe(200);
    expect(await db.query('SELECT * FROM attendance_events WHERE employee_id=$1', [p.employeeId])).toEqual(before);
    const history = await call<Array<{ resourceId: string }>>('/office-locations/history'); expect(history.body.some(r => r.resourceId === l.id)).toBe(true);
  });
});
