import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { databaseMigrations } from '../src/database/migration-registry.js';
import { hasPendingMigrations } from '../src/database/migration-status.js';
import { runPendingMigrations } from '../src/database/migration-runner.js';

// Opt-in only. Never points at the development/customer DB, volumes or API.
describe.skipIf(process.env.R14_DOCKER_TEST !== '1')('R14 isolated production operations and cross-module HTTP', () => {
  const run = promisify(execFile), root = resolve('..'), project = `tmd-r14-${randomUUID().slice(0, 8)}`;
  const directory = resolve(root, 'logs', project), envFile = resolve(directory, 'fixture.env'), override = resolve(directory, 'compose.yaml');
  const secret = randomBytes(48).toString('hex'), password = randomBytes(24).toString('hex'), jwt = new JwtService({ secret });
  const loginPassword = randomBytes(12).toString('hex');
  const label = 'R14 DEVELOPMENT ONLY', oldDate = '2022-08-15', date = '2022-09-15', image = `${randomUUID()}.png`;
  let db: DataSource, api = '', oldCount = 0, backup = '', started = false, today = '', failures = 0;
  let admin: { id: string; employee: string; token: string }, employee: typeof admin, accountant: typeof admin;
  const environment = { ...process.env, COMPOSE_PROJECT_NAME: project, PROD_ENV_FILE: envFile, PROD_COMPOSE_OVERRIDE: override, MSYS_NO_PATHCONV: '1' };
  async function command(executable: string, args: string[]): Promise<string> {
    try { return (await run(executable, args, { cwd: root, env: environment, timeout: 180_000, maxBuffer: 1024 * 1024 })).stdout; }
    catch (error) {
      const details = (error as { stderr?: string; stdout?: string }).stderr ?? '';
      const safe = details.replaceAll(secret, '[REDACTED]').replaceAll(password, '[REDACTED]').replaceAll(loginPassword, '[REDACTED]');
      await writeFile(resolve(directory, `command-error-${++failures}.txt`), safe);
      await writeFile(resolve(directory, 'last-command-error.txt'), safe);
      throw new Error(`R14 command failed: ${executable} ${args[0]} (diagnostics withheld; no credentials in test output)`, { cause: { code: (error as { code?: unknown }).code } });
    }
  }
  const compose = (...args: string[]): Promise<string> => command('docker', ['compose', '-p', project, '--env-file', envFile, '-f', 'compose.production.yaml', '-f', override, ...args]);
  const script = (name: string, ...args: string[]): Promise<string> => command(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'sh', [`scripts/prod/${name}.sh`, ...args]);
  async function ready(): Promise<void> {
    for (let i = 0; i < 120; i++) { if (await fetch(`${api}/health/ready`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false)) return; await delay(500); }
    throw new Error('R14 isolated API readiness timed out');
  }
  async function call(person: typeof admin, path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${api}${path}`, { method, signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${person.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
  async function actor(role: string): Promise<typeof admin> {
    const [user] = await db.query<Array<{ id: string }>>('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id', [`${randomUUID()}@r14.invalid`, await hash(loginPassword, 4)]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [user.id, role]);
    const [person] = await db.query<Array<{ id: string }>>('INSERT INTO employees(employee_code,full_name,user_id) VALUES($1,$2,$3) RETURNING id', [randomUUID().slice(0, 25), label, user.id]);
    const [session] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [user.id, randomUUID(), label]);
    return { id: user.id, employee: person.id, token: await jwt.signAsync({ sub: user.id, sid: session.id }) };
  }
  beforeAll(async () => {
    if (!/^tmd-r14-[a-f0-9]{8}$/.test(project)) throw new Error('Unsafe fixture project');
    await mkdir(directory, { recursive: true });
    await writeFile(envFile, `APP_DOMAIN=r14.invalid\nPOSTGRES_USER=r14\nPOSTGRES_DB=r14\nPOSTGRES_PASSWORD=${password}\nJWT_SECRET=${secret}\nFIREBASE_PUSH_ENABLED=false\n`, { mode: 0o600 });
    const ports = await Promise.all([0, 1, 2, 3].map(async (): Promise<number> => {
      const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
      const port = (socket.address() as AddressInfo).port;
      await new Promise<void>((done, reject) => socket.close(error => error ? reject(error) : done())); return port;
    }));
    // Explicit ports survive stop/start; Docker's random published ports may be reallocated.
    await writeFile(override, `services:\n  postgres:\n    ports: ["127.0.0.1:${ports[0]}:5432"]\n  backend:\n    image: tmd-r14-backend:local\n    ports: ["127.0.0.1:${ports[1]}:3001"]\n    environment:\n      RELEASE_SHA: r14-isolated-test\n  frontend:\n    image: tmd-r14-frontend:local\n    ports: ["127.0.0.1:${ports[2]}:3000"]\n  proxy:\n    environment:\n      APP_DOMAIN: "http://:80"\n    ports: !override ["127.0.0.1:${ports[3]}:80"]\n`);
    started = true;
    await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '60', 'postgres');
    const dbPort = (await compose('port', 'postgres', '5432')).trim().split(':').at(-1);
    const url = `postgresql://r14:${password}@127.0.0.1:${dbPort}/r14`;
    const older = databaseMigrations.filter(migration => Number(migration.name.slice(-13)) <= 1791849600000);
    db = new DataSource({ type: 'postgres', url, migrations: older, migrationsTableName: 'schema_migrations', extra: { connectionTimeoutMillis: 3000 } });
    await db.initialize(); await runPendingMigrations(db); oldCount = older.length;
    [{ today }] = await db.query<Array<{ today: string }>>("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS today");
    admin = await actor('ADMIN'); employee = await actor('EMPLOYEE'); accountant = await actor('CHIEF_ACCOUNTANT');
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time) VALUES($1,'CHECK_IN','OFFICE',$2),($1,'CHECK_OUT','OFFICE',$3)`, [employee.employee, `${oldDate}T08:00:00+07:00`, `${oldDate}T16:00:00+07:00`]);
    await db.query(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,request_note,status,reviewed_by,reviewed_at,evidence_image_reference)
      VALUES($1,$2,'OTHER',$3,'APPROVED',$4,'2022-08-15T12:00:00+07:00',$5)`, [employee.employee, oldDate, label, admin.id, `/api/attendance/evidence/${image}`]);
    await db.query('INSERT INTO attendance_evidence_uploads(evidence_id,filename,uploaded_by) VALUES($1,$2,$3)', [image.slice(0, -4), image, employee.id]);
    await writeFile(resolve(directory, image), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCXsAAAAASUVORK5CYII=', 'base64'));
    await command('docker', ['run', '--rm', '-v', `${project}_evidence-production-data:/data`, '-v', `${directory}:/fixture:ro`, 'alpine:3.22', 'sh', '-ec', `mkdir -p /data/attendance /data/business-trips; cp /fixture/${image} /data/attendance/${image}; chown -R 1000:1000 /data`]);
    backup = (await script('backup')).match(/Backup pair verified: ([A-Za-z0-9-]+)/)![1];
    expect(await script('verify-restore', `deploy/backups/thien-minh-${backup}.dump`)).toContain('Restore verification passed');
    await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'backend', 'frontend');
    api = `http://${(await compose('port', 'backend', '3001')).trim()}/api`; await ready();
  }, 300_000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    // Only this explicitly UUID-owned project/volumes, never compose default.
    if (started && /^tmd-r14-[a-f0-9]{8}$/.test(project)) await compose('down', '--volumes', '--remove-orphans');
  }, 180_000);
  it('upgrades an older database without inventing workflow history or changing legacy attendance', async () => {
    const migrations = await db.query<Array<{ count: number }>>('SELECT count(*)::int AS count FROM schema_migrations');
    expect(migrations[0].count).toBe(databaseMigrations.length); expect(migrations[0].count).toBeGreaterThan(oldCount);
    expect(await hasPendingMigrations(db)).toBe(false);
    const [old] = await db.query<Array<{ status: string; confirmed_by: null; reviewed_by: string; count: number }>>(`SELECT status,confirmed_by,reviewed_by,(SELECT count(*)::int FROM attendance_events) AS count FROM attendance_explanation_requests WHERE work_date=$1`, [oldDate]);
    expect(old).toMatchObject({ status: 'APPROVED', confirmed_by: null, reviewed_by: admin.id, count: 2 });
    expect((await call(admin, '/operations/overview')).body.pendingMigrations).toBe(false);
    expect((await call(employee, '/operations/overview')).status).toBe(403);
    expect((await call(admin, `/reporting/monthly/document?month=2022-08`)).body.summary).toMatchObject({ totalWorkedMinutes: 480 });
    const [account] = await db.query<Array<{ email: string }>>('SELECT email FROM users WHERE id=$1', [employee.id]);
    const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: loginPassword, clientType: 'MOBILE', deviceId: randomUUID(), deviceName: label }) });
    expect(login.status).toBe(200); employee.token = (await login.json() as { accessToken: string }).accessToken;
    expect((await call(employee, '/auth/me')).status).toBe(200);
    const malformed = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{R14_PRIVATE_SYNTAX' });
    expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('R14_PRIVATE_SYNTAX');
  });
  it('migration replay is a no-op and another migration lease cannot run concurrently', async () => {
    const current = new DataSource({ ...db.options, migrations: databaseMigrations }); await current.initialize();
    const lease = db.createQueryRunner(); await lease.connect();
    try {
      expect(await runPendingMigrations(current)).toHaveLength(0);
      await lease.query("SELECT pg_advisory_lock(hashtext('thien-minh-schema-migrations'))");
      await expect(runPendingMigrations(current)).rejects.toThrow('MIGRATION_ALREADY_RUNNING');
    } finally { await lease.query("SELECT pg_advisory_unlock(hashtext('thien-minh-schema-migrations'))"); await lease.release(); await current.destroy(); }
  });
  it('private Caddy routes Web/API correctly and omits credentials/query from its access log', async () => {
    // Local HTTP only; this is NOT a public TLS certificate/browser-cookie acceptance.
    await compose('up', '-d', '--no-build', 'proxy');
    const origin = `http://${(await compose('port', 'proxy', '80')).trim()}`;
    let login: Response | undefined;
    for (let i = 0; i < 40; i++) {
      login = await fetch(`${origin}/login`).catch(() => undefined); if (login?.ok) break; await delay(250);
    }
    expect(login?.status).toBe(200); expect(login?.headers.get('x-frame-options')).toBe('DENY');
    const response = await fetch(`${origin}/api/auth/me?password=R14_PRIVATE_QUERY_SECRET`, { headers: { Authorization: `Bearer ${employee.token}` } });
    expect(response.status).toBe(200); expect((await response.json() as { user: { id: string } }).user.id).toBe(employee.id);
    await compose('stop', '-t', '10', 'backend');
    try {
      const unavailable = await fetch(`${origin}/api/auth/me?password=R14_PRIVATE_QUERY_SECRET`, { headers: { Authorization: `Bearer ${employee.token}` } });
      expect(unavailable.status).toBeGreaterThanOrEqual(500);
    } finally { await compose('start', 'backend'); await ready(); }
    const log = await compose('logs', '--no-color', 'proxy');
    expect(log).not.toContain('R14_PRIVATE_QUERY_SECRET'); expect(log).not.toContain(employee.token);
  });
  it('readiness/operations see a real missing migration without creating another ledger', async () => {
    const [last] = await db.query<Array<{ id: number; timestamp: string; name: string }>>('SELECT * FROM schema_migrations ORDER BY id DESC LIMIT 1');
    await db.query('DELETE FROM schema_migrations WHERE id=$1', [last.id]);
    try {
      expect((await fetch(`${api}/health/ready`)).status).toBe(503);
      expect((await call(admin, '/operations/overview')).body.pendingMigrations).toBe(true);
      const [extra] = await db.query<Array<{ name: string | null }>>("SELECT to_regclass('public.migrations')::text AS name"); expect(extra.name).toBeNull();
    } finally { await db.query('INSERT INTO schema_migrations(id,timestamp,name) VALUES($1,$2,$3)', [last.id, last.timestamp, last.name]); }
    await ready();
  });
  it('employee explanation retry, Admin fallback, inbox and effective adjustment reconcile with KPI', async () => {
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time) VALUES($1,'CHECK_IN','BUSINESS_TRIP',$2),($1,'CHECK_OUT','BUSINESS_TRIP',$3)`, [employee.employee, `${date}T08:00:00+07:00`, `${date}T16:00:00+07:00`]);
    const input = { submissionId: randomUUID(), workDate: date, issueType: 'OTHER', responseText: label, evidenceImageReference: `/api/attendance/evidence/${image}` };
    const submitted = await call(employee, '/attendance/explanations/mine', 'POST', input); expect(submitted.status).toBe(201);
    expect((await call(employee, '/attendance/explanations/mine', 'POST', input)).status).toBe(201);
    const [request] = await db.query<Array<{ id: string; route_version: number }>>('SELECT id,route_version FROM attendance_explanation_requests WHERE submission_id=$1', [input.submissionId]);
    const decision = { status: 'APPROVED', expectedVersion: request.route_version, adminOverrideReason: label, reviewNote: label };
    expect((await call(admin, `/attendance/explanations/${request.id}/review`, 'PATCH', decision)).status).toBe(200);
    expect((await call(admin, `/attendance/explanations/${request.id}/review`, 'PATCH', decision)).status).toBe(409);
    const inbox = await call(employee, '/announcements/mine'); expect(JSON.stringify(inbox.body)).toContain('Giải trình đã được duyệt');
    expect((await call(admin, '/attendance/adjustments', 'POST', { employeeId: employee.employee, workDate: date, fieldName: 'CHECK_OUT_TIME', newValue: `${date}T17:00:00+07:00`, reason: label })).status).toBe(201);
    const report = await call(admin, '/reporting/monthly/document?month=2022-09'), kpi = await call(admin, '/kpi/monthly/document?month=2022-09');
    expect(report.body.summary).toMatchObject({ totalWorkedMinutes: 540, totalOvertimeMinutes: 0, fieldDays: 1 });
    expect(kpi.body.summary).toEqual(report.body.summary);
  });
  it('partial leave reserves, approves and cancels without duplicating work or approved OT', async () => {
    await db.query(`UPDATE leave_policies SET balance_tracking_enabled=true,annual_entitlement_minutes=5760,allow_half_day=true,allow_approved_cancellation=true WHERE code='ANNUAL'`);
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time) VALUES($1,'CHECK_IN','BUSINESS_TRIP',$2),($1,'CHECK_OUT','BUSINESS_TRIP',$3)`, [employee.employee, `${today}T08:00:00+07:00`, `${today}T16:00:00+07:00`]);
    const created = await call(employee, '/leave-requests/mine', 'POST', { leaveType: 'ANNUAL', durationType: 'HALF_DAY', halfDayPeriod: 'AM', startDate: today, endDate: today, reason: label }); expect(created.status).toBe(201);
    const reserved = await call(employee, `/leave-requests/mine/balances?year=${today.slice(0, 4)}`);
    expect(reserved.body).toEqual(expect.arrayContaining([expect.objectContaining({ policyCode: 'ANNUAL', pendingMinutes: 240, approvedMinutes: 0, availableMinutes: 5520 })]));
    const [request] = await db.query<Array<{ id: string; route_version: number }>>('SELECT id,route_version FROM leave_requests WHERE employee_id=$1 AND start_date=$2', [employee.employee, today]);
    expect((await call(admin, `/leave-requests/${request.id}/review`, 'PATCH', { status: 'APPROVED', expectedVersion: request.route_version, adminOverrideReason: label })).status).toBe(200);
    const used = await call(employee, `/leave-requests/mine/balances?year=${today.slice(0, 4)}`);
    expect(used.body).toEqual(expect.arrayContaining([expect.objectContaining({ policyCode: 'ANNUAL', pendingMinutes: 0, approvedMinutes: 240, availableMinutes: 5520 })]));
    const report = await call(admin, `/reporting/monthly/document?month=${today.slice(0, 7)}`); expect(report.body.summary).toMatchObject({ partialLeaveDays: 1, leaveDays: 0, totalWorkedMinutes: 480, totalOvertimeMinutes: 0 });
    expect((await call(employee, `/leave-requests/${request.id}/cancel`, 'POST', { reason: label })).status).toBe(201);
    const balance = await call(employee, `/leave-requests/mine/balances?year=${today.slice(0, 4)}`);
    expect(balance.body).toEqual(expect.arrayContaining([expect.objectContaining({ policyCode: 'ANNUAL', pendingMinutes: 0, approvedMinutes: 0, availableMinutes: 5760 })]));
  });
  it('DB outage returns readiness 503, not a revoked credential; recovery preserves the session', async () => {
    await db.destroy(); await compose('stop', '-t', '10', 'postgres');
    try {
      expect((await fetch(`${api}/health/live`)).status).toBe(200); expect((await fetch(`${api}/health/ready`)).status).toBe(503);
      const unavailable = await call(employee, '/auth/me'); expect(unavailable.status).toBe(503); expect(unavailable.body.code).toBe('DATA_SERVICE_UNAVAILABLE');
    } finally { await compose('start', 'postgres'); await ready(); await db.initialize(); }
    expect((await call(employee, '/auth/me')).status).toBe(200);
  });
  it('restart preserves workflow, image bytes, session and locked snapshot/Excel', async () => {
    expect((await call(admin, '/reporting/periods/2022-09/lock', 'POST', { reason: label })).status).toBe(201);
    const before = await call(admin, '/reporting/monthly/document?month=2022-09'); expect(before.body.source).toBe('SNAPSHOT');
    await compose('restart', 'backend'); await ready();
    expect((await call(employee, '/auth/me')).status).toBe(200);
    expect((await call(admin, '/reporting/monthly/document?month=2022-09')).body).toEqual(before.body);
    const bytes = await fetch(`${api}/attendance/evidence/${image}`, { headers: { Authorization: `Bearer ${employee.token}` } }); expect(bytes.status).toBe(200);
    expect(Buffer.from(await bytes.arrayBuffer())).toEqual(await readFile(resolve(directory, image)));
    for (const path of ['monthly', 'leave', 'overtime', 'explanations']) {
      const exported = await fetch(`${api}/reporting/${path}/export?month=2022-09`, { headers: { Authorization: `Bearer ${admin.token}` } }); expect(exported.status).toBe(200); expect((await exported.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    }
    expect((await call(admin, '/attendance/adjustments', 'POST', { employeeId: employee.employee, workDate: date, fieldName: 'DAY_STATUS', newValue: 'PRESENT', reason: label })).status).toBe(409);
    expect((await call(accountant, '/reporting/periods/2022-09/reopen', 'POST', { reason: label })).status).toBe(201);
    expect((await call(admin, '/kpi/monthly/document?month=2022-09&revision=1')).body.source).toBe('SNAPSHOT');
  });
  it('real backup/restore includes new snapshots and owned evidence; corrupted/mismatched pair is rejected', async () => {
    const result = await script('backup'); backup = result.match(/Backup pair verified: ([A-Za-z0-9-]+)/)![1]; await ready();
    const dump = `deploy/backups/thien-minh-${backup}.dump`, archive = resolve(root, `deploy/backups/thien-minh-evidence-${backup}.tar.gz`);
    expect(await script('verify-restore', dump)).toContain('Restore verification passed');
    await expect(script('verify-restore', dump, 'deploy/backups/thien-minh-evidence-other.tar.gz')).rejects.toThrow('R14 command failed');
    const valid = await readFile(archive); await writeFile(archive, Buffer.from('R14 CORRUPTED DEVELOPMENT ONLY'));
    try { await expect(script('verify-restore', dump)).rejects.toThrow('R14 command failed'); }
    finally { await writeFile(archive, valid); }
    const manifestPath = resolve(root, `deploy/backups/thien-minh-${backup}.sha256`), manifest = await readFile(manifestPath);
    await command('docker', ['run', '--rm', '--network', 'none', '-v', `${directory}:/fixture`, 'alpine:3.22', 'sh', '-ec', 'mkdir /tmp/empty; tar -czf /fixture/no-evidence.tar.gz -C /tmp/empty .']);
    const missing = await readFile(resolve(directory, 'no-evidence.tar.gz'));
    await writeFile(archive, missing);
    const checksum = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
    await writeFile(manifestPath, `${checksum(await readFile(resolve(root, dump)))} *thien-minh-${backup}.dump\n${checksum(missing)} *thien-minh-evidence-${backup}.tar.gz\n`);
    try {
      await expect(script('verify-restore', dump)).rejects.toThrow('R14 command failed');
      expect(await readFile(resolve(directory, 'last-command-error.txt'), 'utf8')).toContain('Restored DB references missing evidence');
    } finally { await writeFile(archive, valid); await writeFile(manifestPath, manifest); }
    expect((await call(admin, '/operations/overview')).body.release).toBe('r14-isolated-test');
    const frontend = `http://${(await compose('port', 'frontend', '3000')).trim()}`; expect((await fetch(`${frontend}/login`)).status).toBe(200);
  });
  it('failed backup resumes only its stopped Backend; dirty worktree cannot deploy', async () => {
    const original = await readFile(override, 'utf8');
    await writeFile(override, `${original}  evidence-backup:\n    entrypoint: ["sh", "-c", "exit 13"]\n`);
    try { await expect(script('backup')).rejects.toThrow('R14 command failed'); }
    finally { await writeFile(override, original); }
    await ready(); expect((await call(employee, '/auth/me')).status).toBe(200);
    await expect(script('deploy')).rejects.toThrow('R14 command failed');
    expect(await readFile(resolve(directory, 'last-command-error.txt'), 'utf8')).toContain('clean committed worktree');
    expect((await call(employee, '/auth/me')).status).toBe(200);
  });
  it('restored DB and images work through a separate production API without changing the source session', async () => {
    const restoredProject = `${project}-restore`, restoredOverride = resolve(directory, 'restore-compose.yaml');
    if (!/^tmd-r14-[a-f0-9]{8}-restore$/.test(restoredProject)) throw new Error('Unsafe restore fixture');
    const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
    const port = (socket.address() as AddressInfo).port;
    await new Promise<void>((done, reject) => socket.close(error => error ? reject(error) : done()));
    await writeFile(restoredOverride, `services:\n  backend:\n    image: tmd-r14-backend:local\n    ports: ["127.0.0.1:${port}:3001"]\n    environment:\n      RELEASE_SHA: r14-restored-test\n`);
    const restored = (...args: string[]): Promise<string> => command('docker', ['compose', '-p', restoredProject, '--env-file', envFile, '-f', 'compose.production.yaml', '-f', restoredOverride, ...args]);
    try {
      expect(await script('verify-restore', `deploy/backups/thien-minh-${backup}.dump`)).toContain('Restore verification passed');
      await restored('up', '-d', '--no-build', '--wait', '--wait-timeout', '60', 'postgres');
      const container = (await restored('ps', '-q', 'postgres')).trim();
      await command('docker', ['cp', resolve(root, `deploy/backups/thien-minh-${backup}.dump`), `${container}:/tmp/r14.dump`]);
      await restored('exec', '-T', 'postgres', 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'r14', '-d', 'r14', '/tmp/r14.dump');
      await command('docker', ['run', '--rm', '--network', 'none', '-v', `${restoredProject}_evidence-production-data:/data`, '-v', `${resolve(root, 'deploy/backups')}:/backups:ro`, 'alpine:3.22', 'tar', '-xzf', `/backups/thien-minh-evidence-${backup}.tar.gz`, '-C', '/data']);
      await restored('up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'backend');
      const endpoint = `http://127.0.0.1:${port}/api`;
      // Use a real restored hash/login. Replacing the copied session must not
      // revoke the employee's independent session in the original test DB.
      const [account] = await db.query<Array<{ email: string }>>('SELECT email FROM users WHERE id=$1', [employee.id]);
      const login = await fetch(`${endpoint}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: loginPassword, clientType: 'MOBILE', deviceId: randomUUID(), deviceName: label }) });
      expect(login.status).toBe(200); const token = (await login.json() as { accessToken: string }).accessToken;
      const result = await fetch(`${endpoint}/kpi/monthly/document?month=2022-09&revision=1`, { headers: { Authorization: `Bearer ${admin.token}` } });
      expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ source: 'SNAPSHOT', revision: 1, summary: { totalWorkedMinutes: 540, totalOvertimeMinutes: 0 } });
      const photo = await fetch(`${endpoint}/attendance/evidence/${image}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(photo.status).toBe(200); expect(Buffer.from(await photo.arrayBuffer())).toEqual(await readFile(resolve(directory, image)));
      const workbook = await fetch(`${endpoint}/reporting/monthly/export?month=2022-09&revision=1`, { headers: { Authorization: `Bearer ${admin.token}` } });
      expect(workbook.status).toBe(200); expect((await workbook.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      expect((await call(employee, '/auth/me')).status).toBe(200);
    } finally { await restored('down', '--volumes', '--remove-orphans'); }
  });
});
