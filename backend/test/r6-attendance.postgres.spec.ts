import 'reflect-metadata';
import { createHash, createPublicKey, generateKeyPairSync, type KeyObject, randomUUID, sign } from 'node:crypto';
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

interface Actor { id: string; employeeId: string; sid: string; token: string; privateKey: KeyObject; bindingId: string; deviceId: string; publicKey: string }
const label = 'R6 development-only adversarial fixture';
const gps = { latitude: 10, longitude: 106, accuracyMeters: 5, mockLocationSignal: false };
// Synthetic image, deliberately NOT proof of a live camera or physical presence.
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT9sAAAAASUVORK5CYII=', 'base64');

describe.skipIf(process.env.R6_POSTGRES_TEST !== '1')('R6 attendance — isolated PostgreSQL / real HTTP', () => {
  const name = `r6_attendance_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let maintenance: DataSource, db: DataSource, created = false, child: ChildProcess | undefined;
  let api = '', storage = '', branch = '', department = '';
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R6 requires local development DB');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() }); await db.initialize(); await db.runMigrations();
    storage = await mkdtemp(join(tmpdir(), 'r6-attendance-evidence-'));
    const [b] = await db.query<Array<{ id: string }>>(`INSERT INTO branches(code,name) VALUES('R6',$1) RETURNING id`, [label]); branch = b.id;
    const [d] = await db.query<Array<{ id: string }>>(`INSERT INTO departments(code,name) VALUES('R6',$1) RETURNING id`, [label]); department = d.id;
    await db.query(`INSERT INTO office_locations(name,address,latitude,longitude,radius_meters,accuracy_threshold_meters,branch_id) VALUES($1,$1,10,106,100,50,$2)`, [label, branch]);
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done, reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R6_API_ENTRY ?? 'dist/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret, EVIDENCE_STORAGE_DIR: storage,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000',
    } });
    for (let i = 0; i < 250; i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated API before R6');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) return;
      await delay(100);
    }
    throw new Error('R6 API readiness timeout');
  }, 40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r6_attendance_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
    if (storage && dirname(storage) === tmpdir() && basename(storage).startsWith('r6-attendance-evidence-')) await rm(storage, { recursive: true, force: true });
  }, 15_000);
  async function actor(bound = true): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r6-${randomUUID()}@development.invalid`]);
    await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='EMPLOYEE'`, [u.id]);
    const [e] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id,department_id) VALUES($1,$2,$3,$4) RETURNING id`, [randomUUID().replaceAll('-', '').slice(0, 28), label, u.id, department]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`, [e.id, branch, department]);
    const deviceId = randomUUID(), keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = keys.publicKey.export({ type:'spki',format:'pem' }).toString();
    const fingerprint = createHash('sha256').update(publicKey).digest('hex');
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [u.id, deviceId, label]);
    let bindingId = '';
    if (bound) { const [b] = await db.query<Array<{id:string}>>(`INSERT INTO attendance_devices(user_id,employee_id,device_id,device_name,public_key,fingerprint,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`, [u.id,e.id,deviceId,label,publicKey,fingerprint]); bindingId = b.id; }
    return { id: u.id, employeeId: e.id, sid: s.id, token: await jwt.signAsync({ sub: u.id, sid: s.id, roles: ['ADMIN'] }, { expiresIn: 900 }), privateKey:keys.privateKey,bindingId,deviceId,publicKey };
  }
  async function call(p: Actor, path: string, body?: unknown, headers = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const r = await fetch(`${api}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${p.token}`, ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(10_000) });
    return { status: r.status, body: await r.json() as Record<string, unknown> };
  }
  async function capture(p: Actor, extra = {}): Promise<string> {
    const r = await call(p, '/attendance/check-in-captures', { ...gps, attendanceType: 'OFFICE', ...extra });
    expect(r.status).toBe(201); return r.body.id as string;
  }
  async function upload(p: Actor, id: string): Promise<number> {
    const form = new FormData(); form.set('evidenceId', id); form.set('file', new Blob([photo], { type: 'image/png' }), 'synthetic.png');
    return (await fetch(`${api}/attendance/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${p.token}` }, body: form, signal: AbortSignal.timeout(10_000) })).status;
  }
  async function proof(p: Actor, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const r = await call(p, '/attendance/device-challenges', input);
    expect(r.status).toBe(201);
    return { ...input, challengeId:r.body.id,signature:sign('sha256', Buffer.from(r.body.payload as string), p.privateKey).toString('base64') };
  }
  async function record(p: Actor, extra = {}): ReturnType<typeof call> {
    const input = { ...gps, attendanceType: 'OFFICE', eventType: 'CHECK_IN', ...extra };
    const challenge = await call(p, '/attendance/device-challenges', input);
    if (challenge.status !== 201) return challenge;
    return call(p, '/attendance/events', { ...input,challengeId:challenge.body.id,signature:sign('sha256',Buffer.from(challenge.body.payload as string),p.privateKey).toString('base64') });
  }
  const count = (p: Actor): Promise<unknown[]> => db.query('SELECT id FROM attendance_events WHERE employee_id=$1', [p.employeeId]);
  async function ready(p: Actor, extra = {}): Promise<string> { const id = await capture(p, extra); expect(await upload(p, id)).toBe(201); return id; }
  const deviceKey = (p: Actor): string => createPublicKey(p.publicKey).export({ type: 'spki', format: 'der' }).toString('base64');
  async function deviceDecision(who: Actor, id: unknown, action: string, reason = label): Promise<number> {
    return (await fetch(`${api}/attendance/devices/${String(id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }), signal: AbortSignal.timeout(10_000) })).status;
  }

  it('first device auto-binds once, records a truthful audit, but still requires a signed event', async () => {
    const p = await actor(false), input = { publicKey: deviceKey(p) };
    const first = await call(p, '/attendance/devices/register', input);
    expect(first.status).toBe(201); expect(first.body.status).toBe('ACTIVE');
    const again = await call(p, '/attendance/devices/register', input);
    expect(again.body).toEqual(first.body);
    const [binding] = await db.query<Array<{ decided_at: Date; decided_by: string | null }>>('SELECT decided_at,decided_by FROM attendance_devices WHERE id=$1', [first.body.id]);
    expect(binding.decided_at).toBeInstanceOf(Date); expect(binding.decided_by).toBeNull(); // No fabricated Admin approval.
    const audits = await db.query<Array<{ action: string; created_by: string }>>(`SELECT action,created_by FROM configuration_audit_logs WHERE resource_type='ATTENDANCE_DEVICE' AND resource_id=$1`, [first.body.id]);
    expect(audits).toEqual([{ action: 'AUTO_BIND_FIRST_DEVICE', created_by: p.id }]);
    const id = await ready(p);
    expect((await call(p, '/attendance/events', { ...gps, attendanceType: 'OFFICE', eventType: 'CHECK_IN', checkinCaptureId: id })).body.code).toBe('ATTENDANCE_PROOF_REQUIRED');
    expect(await count(p)).toHaveLength(0);
    expect((await record(p, { checkinCaptureId: id })).status).toBe(201); // Fixture signing is NOT real biometric verification.
  });
  it('concurrent first registrations with one key create exactly one binding and audit', async () => {
    const p = await actor(false);
    const replies = await Promise.all(Array.from({ length: 8 }, () => call(p, '/attendance/devices/register', { publicKey: deviceKey(p) })));
    expect(replies.every(r => r.status === 201 && r.body.status === 'ACTIVE')).toBe(true);
    expect(new Set(replies.map(r => r.body.id)).size).toBe(1);
    expect(await db.query('SELECT id FROM attendance_devices WHERE user_id=$1', [p.id])).toHaveLength(1);
    expect(await db.query(`SELECT id FROM configuration_audit_logs WHERE created_by=$1 AND action='AUTO_BIND_FIRST_DEVICE'`, [p.id])).toHaveLength(1);
  });
  it('competing first keys cannot both gain attendance authority', async () => {
    const p = await actor(false), other = await actor(false);
    const replies = await Promise.all([deviceKey(p), deviceKey(other)].map(publicKey => call(p, '/attendance/devices/register', { publicKey })));
    expect(replies.filter(r => r.status === 201 && r.body.status === 'ACTIVE')).toHaveLength(1);
    expect(replies.filter(r => r.body.code === 'ATTENDANCE_DEVICE_MISMATCH')).toHaveLength(1);
    expect(await db.query('SELECT id FROM attendance_devices WHERE user_id=$1', [p.id])).toHaveLength(1);
  });
  it('revoking the auto-bound first key does not re-open automatic enrollment, even for the same key', async () => {
    const p = await actor(false), admin = await actor();
    await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='ADMIN'`, [admin.id]);
    const first = await call(p, '/attendance/devices/register', { publicKey: deviceKey(p) });
    expect(await deviceDecision(admin, first.body.id, 'REVOKE')).toBe(200);
    const replacement = await call(p, '/attendance/devices/register', { publicKey: deviceKey(p) });
    expect(replacement.status).toBe(201); expect(replacement.body.status).toBe('PENDING');
    expect(replacement.body.id).not.toBe(first.body.id);
    expect((await call(p, '/attendance/device-challenges', { ...gps, eventType: 'CHECK_OUT', attendanceType: 'OFFICE' })).status).toBe(403);
    expect(await deviceDecision(p, replacement.body.id, 'APPROVE')).toBe(403);
    expect(await deviceDecision(admin, replacement.body.id, 'APPROVE')).toBe(200);
  });
  it('existing pending registrations are not silently promoted, and reject a different key', async () => {
    const p = await actor(), other = await actor(false);
    await db.query(`UPDATE attendance_devices SET status='PENDING' WHERE id=$1`, [p.bindingId]);
    const result = await call(p, '/attendance/devices/register', { publicKey: deviceKey(p) });
    expect(result.body).toMatchObject({ id: p.bindingId, status: 'PENDING' });
    expect((await call(p, '/attendance/devices/register', { publicKey: deviceKey(other) })).body.code).toBe('ATTENDANCE_DEVICE_PENDING');
    expect(await db.query(`SELECT id FROM configuration_audit_logs WHERE created_by=$1 AND action='AUTO_BIND_FIRST_DEVICE'`, [p.id])).toHaveLength(0);
  });
  it('invalid key or inactive employee cannot gain or consume the first-device registration', async () => {
    const p = await actor(false);
    expect((await call(p, '/attendance/devices/register', { publicKey: Buffer.from('not a key').toString('base64') })).status).toBe(400);
    expect(await db.query('SELECT id FROM attendance_devices WHERE user_id=$1', [p.id])).toHaveLength(0);
    await db.query('UPDATE employees SET is_active=false WHERE id=$1', [p.employeeId]);
    expect([400, 401, 403]).toContain((await call(p, '/attendance/devices/register', { publicKey: deviceKey(p) })).status);
    expect(await db.query('SELECT id FROM attendance_devices WHERE user_id=$1', [p.id])).toHaveLength(0);
    await db.query('UPDATE employees SET is_active=true WHERE id=$1', [p.employeeId]);
    expect((await call(p, '/attendance/devices/register', { publicKey: deviceKey(p) })).body.status).toBe('ACTIVE');
  });

  it('serializes a burst of 16 duplicate check-ins and 16 checkouts, without extra pairs', async () => {
    const p = await actor(), id = await ready(p);
    const entered = await proof(p, {...gps,attendanceType:'OFFICE',eventType:'CHECK_IN',checkinCaptureId:id});
    const ins = await Promise.all(Array.from({ length: 16 }, () => call(p, '/attendance/events', entered)));
    expect(ins.filter(r => r.status === 201)).toHaveLength(1);
    expect(ins.filter(r => r.body.code === 'DAILY_CHECK_IN_LIMIT')).toHaveLength(15);
    const exited = await proof(p, {...gps,attendanceType:'OFFICE',eventType:'CHECK_OUT'});
    const outs = await Promise.all(Array.from({ length: 16 }, () => call(p, '/attendance/events', exited)));
    expect(outs.filter(r => r.status === 201)).toHaveLength(1);
    expect(outs.filter(r => r.body.code === 'DAILY_CHECK_OUT_LIMIT')).toHaveLength(15);
    expect(await count(p)).toHaveLength(2);
  });
  it('serializes mixed office/field contenders without creating extra attendance', async () => {
    const p = await actor(), id = await ready(p, { attendanceType: 'BUSINESS_TRIP', fieldWorkContent: label });
    const field = await proof(p,{...gps,attendanceType:'BUSINESS_TRIP',eventType:'CHECK_IN',checkinCaptureId:id});
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => call(p, '/attendance/events', {...field,attendanceType:i % 2 ? 'OFFICE' : 'BUSINESS_TRIP'})));
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    expect((await record(p, { eventType: 'CHECK_OUT' })).body.code).toBe('ATTENDANCE_TYPE_MISMATCH');
    expect((await record(p, { attendanceType: 'BUSINESS_TRIP', eventType: 'CHECK_OUT' })).status).toBe(201);
    expect(await count(p)).toHaveLength(2);
  });
  it('a committed write with discarded response is recoverable by reading, never a second write', async () => {
    const p = await actor(), id = await ready(p);
    await record(p, { checkinCaptureId: id }); // Simulates caller discarding a committed response, not a radio outage.
    expect((await record(p, { checkinCaptureId: id })).body.code).toBe('DAILY_CHECK_IN_LIMIT');
    expect((await call(p, '/attendance/me/today')).body.status).toBe('CHECKED_IN');
    expect(await count(p)).toHaveLength(1);
  });
  it.each(['2000-01-01T00:00:00Z', '2099-12-31T23:59:59Z'])('device clock %s cannot backdate work or change its day', async deviceTime => {
    const p = await actor(), id = await ready(p), start = Date.now();
    const r = await record(p, { checkinCaptureId: id, deviceTime });
    expect(r.status).toBe(201);
    expect(Date.parse(r.body.serverTime as string)).toBeGreaterThanOrEqual(start);
    expect(Date.parse(r.body.serverTime as string)).toBeLessThanOrEqual(Date.now());
    const [row] = await db.query<Array<{ device_time: Date }>>('SELECT device_time FROM attendance_events WHERE employee_id=$1', [p.employeeId]);
    expect(row.device_time.toISOString()).toBe(new Date(deviceTime).toISOString());
  });
  it.each(['employeeId', 'serverTime', 'dailyPolicy', 'riskFlags', 'officeLocationId', 'deviceId'])('rejects forged %s rather than trusting caller identity/rules', async key => {
    const p = await actor();
    expect((await record(p, { [key]: randomUUID() })).status).toBe(400);
    expect(await count(p)).toHaveLength(0);
  });
  it('rejects missing mock/accuracy on capture and malformed GPS before any context/event', async () => {
    const p = await actor();
    for (const extra of [{ mockLocationSignal: undefined }, { accuracyMeters: undefined }, { latitude: null }, { latitude: '10' }, { longitude: 181 }, { accuracyMeters: -1 }]) {
      expect((await call(p, '/attendance/check-in-captures', { ...gps, attendanceType: 'OFFICE', ...extra })).status).toBe(400);
    }
    expect(await db.query('SELECT id FROM attendance_checkin_captures WHERE employee_id=$1', [p.employeeId])).toHaveLength(0);
  });
  it('capture ownership, replacement and current Vietnam day forbid stolen/stale evidence reuse', async () => {
    const p = await actor(), other = await actor(), old = await ready(p), id = await ready(p);
    expect((await record(p, { checkinCaptureId: old })).status).toBe(409);
    expect((await record(other, { checkinCaptureId: id })).status).toBe(409);
    await db.query(`UPDATE attendance_checkin_captures SET prepared_at=now()-interval '1 day' WHERE id=$1`, [id]);
    expect((await record(p, { checkinCaptureId: id })).body.code).toBe('CHECK_IN_CAPTURE_EXPIRED');
    expect(await count(p)).toHaveLength(0);
  });
  it('rejects a revoked/expired session and inactive employee at the HTTP gate', async () => {
    for (const sql of ["UPDATE auth_sessions SET revoked_at=now() WHERE id=$1", "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE id=$1"]) {
      const p = await actor(), id = await ready(p); await db.query(sql, [p.sid]);
      expect((await record(p, { checkinCaptureId: id })).status).toBe(401); expect(await count(p)).toHaveLength(0);
    }
    const p = await actor(), id = await ready(p); await db.query('UPDATE employees SET is_active=false,employment_end_date=current_date,employment_status_reason=$2 WHERE id=$1', [p.employeeId,label]);
    expect((await record(p, { checkinCaptureId: id })).status).toBe(401); expect(await count(p)).toHaveLength(0);
  });
  it('rechecks session revocation after request passed auth but waited for employee lock', async () => {
    const p = await actor(), id = await ready(p), blocker = db.createQueryRunner(); await blocker.connect(); await blocker.startTransaction();
    let response: ReturnType<typeof record> | undefined;
    try {
      await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`attendance-event:${p.employeeId}`]);
      response = record(p, { checkinCaptureId: id });
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const [row] = await db.query<Array<{ waiting: boolean }>>(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%') AS waiting`, [name]);
        if (row.waiting) { waiting = true; break; } await delay(25);
      }
      expect(waiting).toBe(true);
      await db.query('UPDATE auth_sessions SET revoked_at=now(),revoke_reason=$2 WHERE id=$1', [p.sid, label]);
      await blocker.commitTransaction();
      expect((await response).status).toBe(401); expect(await count(p)).toHaveLength(0);
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction(); await blocker.release(); if (response) await response;
    }
  });
  it('cloned bearer token alone cannot record without the approved private key', async () => {
    const p = await actor(), clone = { ...p }, id = await ready(clone);
    expect((await call(clone,'/attendance/events',{...gps,attendanceType:'OFFICE',eventType:'CHECK_IN',checkinCaptureId:id})).status).toBe(403);
    expect(await count(p)).toHaveLength(0);
  });
  it('replacement device registration is pending, only live Admin can approve/revoke, every decision is audited', async () => {
    const p = await actor(), admin = await actor();
    await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='ADMIN'`, [admin.id]);
    expect(await deviceDecision(admin, p.bindingId, 'REVOKE')).toBe(200);
    const publicKey = generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'der'}).toString('base64');
    const r = await call(p,'/attendance/devices/register',{publicKey});
    expect(r.status).toBe(201); expect(r.body.status).toBe('PENDING');
    expect((await call(p,'/attendance/devices')).status).toBe(403); // Forged JWT ADMIN never creates authority.
    expect((await call(p,'/attendance/device-challenges',{...gps,eventType:'CHECK_IN',attendanceType:'OFFICE'})).status).toBe(403);
    const decide = (who: Actor, action: string, reason = label): Promise<number> => deviceDecision(who, r.body.id, action, reason);
    expect(await decide(p,'APPROVE')).toBe(403);
    expect(await decide(admin,'APPROVE','     ')).toBe(400);
    expect(await decide(admin,'APPROVE')).toBe(200);
    expect(await decide(admin,'APPROVE')).toBe(409);
    expect(await decide(admin,'REVOKE')).toBe(200);
    expect(await decide(admin,'REVOKE')).toBe(409);
    const audits = await db.query<Array<{action:string}>>(`SELECT action FROM configuration_audit_logs WHERE resource_type='ATTENDANCE_DEVICE' AND resource_id=$1 ORDER BY created_at`,[r.body.id]);
    expect(audits.map(a => a.action)).toEqual(['REGISTER','APPROVE','REVOKE']);
  });
  it('active binding cannot be replaced by self-registration or a different key', async () => {
    const p = await actor();
    const key = generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'der'}).toString('base64');
    expect((await call(p,'/attendance/devices/register',{publicKey:key})).status).toBe(403);
    expect((await call(p,'/attendance/devices/register',{publicKey:Buffer.from('not a key').toString('base64')})).status).toBe(400);
    expect((await db.query<Array<{status:string}>>('SELECT status FROM attendance_devices WHERE id=$1',[p.bindingId]))[0].status).toBe('ACTIVE');
  });
  it('rejects another private key even with valid bearer token, challenge and camera upload', async () => {
    const p = await actor(), other = await actor(), id = await ready(p);
    const c = await call(p,'/attendance/device-challenges',{...gps,eventType:'CHECK_IN',attendanceType:'OFFICE',checkinCaptureId:id});
    const signature = sign('sha256',Buffer.from(c.body.payload as string),other.privateKey).toString('base64');
    expect((await call(p,'/attendance/events',{...gps,eventType:'CHECK_IN',attendanceType:'OFFICE',checkinCaptureId:id,challengeId:c.body.id,signature})).body.code).toBe('ATTENDANCE_PROOF_INVALID');
    expect(await count(p)).toHaveLength(0);
  });
  it.each([{latitude:11},{accuracyMeters:1},{mockLocationSignal:true},{attendanceType:'BUSINESS_TRIP'},{eventType:'CHECK_OUT'}])('signature is bound to request data: %j', async extra => {
    const p = await actor(), id = await ready(p);
    const input = await proof(p,{...gps,eventType:'CHECK_IN',attendanceType:'OFFICE',checkinCaptureId:id});
    expect([400,409]).toContain((await call(p,'/attendance/events',{...input,...extra})).status);
    expect(await count(p)).toHaveLength(0);
  });
  it('expired or superseded challenge is rejected, without consuming the daily pair', async () => {
    const p = await actor(), id = await ready(p), input = {...gps,eventType:'CHECK_IN',attendanceType:'OFFICE',checkinCaptureId:id};
    const old = await proof(p,input), current = await proof(p,input);
    expect((await call(p,'/attendance/events',old)).body.code).toBe('ATTENDANCE_PROOF_EXPIRED');
    await db.query(`UPDATE attendance_device_challenges SET expires_at=now()-interval '1 second' WHERE id=$1`,[current.challengeId]);
    expect((await call(p,'/attendance/events',current)).body.code).toBe('ATTENDANCE_PROOF_EXPIRED');
    expect(await count(p)).toHaveLength(0);
  });
  it('an already issued proof loses authority when its device is revoked', async () => {
    const p = await actor(), id = await ready(p), input = await proof(p,{...gps,eventType:'CHECK_IN',attendanceType:'OFFICE',checkinCaptureId:id});
    await db.query(`UPDATE attendance_devices SET status='REVOKED' WHERE id=$1`,[p.bindingId]);
    expect((await call(p,'/attendance/events',input)).body.code).toBe('ATTENDANCE_DEVICE_REQUIRED');
    expect(await count(p)).toHaveLength(0);
  });
  it('changing uploaded photo after challenge invalidates its signed evidence digest', async () => {
    const p = await actor(), id = await ready(p), input = await proof(p,{...gps,eventType:'CHECK_IN',attendanceType:'OFFICE',checkinCaptureId:id});
    const form = new FormData(); form.set('evidenceId',id); form.set('file',new Blob([Buffer.concat([photo,Buffer.from('changed')])],{type:'image/png'}),'synthetic.png');
    expect((await fetch(`${api}/attendance/evidence`,{method:'POST',headers:{Authorization:`Bearer ${p.token}`},body:form,signal:AbortSignal.timeout(10_000)})).status).toBe(201);
    expect((await call(p,'/attendance/events',input)).body.code).toBe('ATTENDANCE_PHOTO_CHANGED');
    expect(await count(p)).toHaveLength(0);
  });
  it.each([['CAPTURE',10,'/attendance/check-in-captures'],['EVENT',60,'/attendance/events']])('enforces durable account budget %s without trusting IP', async (bucket,limit,path) => {
    const p = await actor();
    // Fill the fixture budget directly: testing quota enforcement, not a timing-dependent minute-boundary flood.
    await db.query(`INSERT INTO attendance_abuse_budgets(user_id,bucket,window_start,attempts) VALUES($1,$2,date_trunc('minute',clock_timestamp()),$3)`,[p.id,bucket,limit]);
    const result = await call(p,String(path),{...gps,attendanceType:'OFFICE',eventType:'CHECK_IN'},{'X-Forwarded-For':'203.0.113.40'});
    expect(result.status).toBe(429); expect(result.body.code).toBe('ATTENDANCE_RATE_LIMITED'); expect(await count(p)).toHaveLength(0);
    const other = await actor();
    expect((await call(other,String(path),{...gps,attendanceType:'OFFICE',eventType:'CHECK_IN'},{'X-Forwarded-For':'203.0.113.40'})).status).not.toBe(429);
    await db.query(`UPDATE attendance_abuse_budgets SET window_start=now()-interval '2 minutes' WHERE user_id=$1 AND bucket=$2`,[p.id,bucket]);
    expect((await call(p,String(path),{...gps,attendanceType:'OFFICE',eventType:'CHECK_IN'})).status).not.toBe(429);
  });
  it('upload budget rejects before file interceptor/storage and has a Retry-After header', async () => {
    const p = await actor();
    await db.query(`INSERT INTO attendance_abuse_budgets(user_id,bucket,window_start,attempts) VALUES($1,'UPLOAD',date_trunc('minute',clock_timestamp()),20)`,[p.id]);
    const form = new FormData(); form.set('evidenceId',randomUUID()); form.set('file',new Blob([photo],{type:'image/png'}),'synthetic.png');
    const r = await fetch(`${api}/attendance/evidence`,{method:'POST',headers:{Authorization:`Bearer ${p.token}`},body:form,signal:AbortSignal.timeout(10_000)});
    expect(r.status).toBe(429); expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await db.query('SELECT evidence_id FROM attendance_evidence_uploads WHERE uploaded_by=$1',[p.id])).toHaveLength(0);
  });
  it('second phone login cannot use existing binding even with an otherwise valid account/session', async () => {
    const p = await actor();
    await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[p.sid]);
    const [s] = await db.query<Array<{id:string}>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`,[p.id,randomUUID(),label]);
    const other = {...p,sid:s.id,token:await jwt.signAsync({sub:p.id,sid:s.id},{expiresIn:900})};
    expect((await call(other,'/attendance/device-challenges',{...gps,eventType:'CHECK_OUT',attendanceType:'OFFICE'})).status).toBe(403);
    expect((await call(p,'/attendance/me/today')).status).toBe(401);
  });
  it('checkout requires accurate non-mock sample, but may be outside office; exact GPS stays Admin-only', async () => {
    const p = await actor(), id = await ready(p); expect((await record(p,{checkinCaptureId:id})).status).toBe(201);
    for (const extra of [{accuracyMeters:90},{mockLocationSignal:true}]) {
      expect((await record(p,{eventType:'CHECK_OUT',...extra})).body.code).toBe('ATTENDANCE_LOCATION_REJECTED');
      expect(await count(p)).toHaveLength(1);
    }
    const out = await record(p,{eventType:'CHECK_OUT',latitude:11,longitude:107});
    expect(out.status).toBe(201); expect(out.body).toMatchObject({distanceMeters:null,accuracyMeters:null,officeLocationId:null});
    expect(out.body).not.toHaveProperty('latitude');
    expect((await call(p,`/attendance/daily/${p.employeeId}/details?date=${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})}`)).status).toBe(403);
    expect(await count(p)).toHaveLength(2);
  });
  it.each([{mockLocationSignal:true},{accuracyMeters:90},{latitude:11}])('blocks reported GPS risk before allocating photo context: %j', async extra => {
    const p = await actor();
    const r = await call(p,'/attendance/check-in-captures',{...gps,attendanceType:'OFFICE',...extra});
    expect(r.status).toBe(403); expect(r.body.code).toBe('ATTENDANCE_LOCATION_REJECTED'); expect(await count(p)).toHaveLength(0);
  });
  // OPEN limitation, not proof of presence: an approved malicious client still controls GPS/photo.
  it('OPEN GAP: a valid key plus fabricated clean GPS is still accepted irrespective of IP headers', async () => {
    const p = await actor(), id = await ready(p);
    const input = await proof(p,{...gps,attendanceType:'OFFICE',eventType:'CHECK_IN',checkinCaptureId:id});
    const r = await call(p, '/attendance/events', input, { 'X-Forwarded-For': '203.0.113.10', 'User-Agent': 'R6 synthetic client' });
    expect(r.status).toBe(201); expect(r.body.riskFlags).not.toContain('MOCK_LOCATION_SIGNAL');
  });
});
