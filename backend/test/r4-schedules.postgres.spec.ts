import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

interface Actor { id: string; employeeId: string; token: string }
interface Schedule { id: string; name: string; weekdays: number[]; startTime: string; endTime: string; lateToleranceMinutes: number; earlyLeaveToleranceMinutes: number; requiredWorkMinutes: number }
interface Daily { employeeId: string; workedMinutes: number; requiredWorkMinutes: number; overtimeMinutes: number; isFullWorkday: boolean }
const label = 'R4 Development-only acceptance';

// Explicit local acceptance: dedicated database/API, no seeds, customer writes, push or email.
describe.skipIf(process.env.R4_POSTGRES_TEST !== '1')('R4 schedules — isolated PostgreSQL and HTTP', () => {
  const name = `r4_schedules_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret, signOptions: { expiresIn: 900 } });
  let maintenance: DataSource, db: DataSource, created = false, child: ChildProcess | undefined;
  let api = '', branch = '', department = '', admin: Actor;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^r4_schedules_test_[a-f0-9]{32}$/.test(name)) throw new Error('R4 requires an owned local development database');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() }); await db.initialize(); await db.runMigrations();
    const [b] = await db.query<Array<{ id: string }>>(`INSERT INTO branches(code,name) VALUES('R4-DEV',$1) RETURNING id`, [label]); branch = b.id;
    const [d] = await db.query<Array<{ id: string }>>(`INSERT INTO departments(code,name) VALUES('R4-DEV',$1) RETURNING id`, [label]); department = d.id;
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port; await new Promise<void>((done, reject) => probe.close(e => e ? reject(e) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, ['dist/main.js'], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3000' } });
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error('Build Backend before R4 acceptance');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor(RoleCode.Admin); return; }
      await delay(100);
    }
    throw new Error('R4 isolated API readiness timeout');
  }, 30_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r4_schedules_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  }, 15_000);
  async function actor(role: RoleCode = RoleCode.Employee): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r4-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [u.id, role]);
    const [e] = await db.query<Array<{ id: string }>>('INSERT INTO employees(employee_code,full_name,user_id,department_id) VALUES($1,$2,$3,$4) RETURNING id', [randomUUID().slice(0, 28), label, u.id, department]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`, [e.id, branch, department]);
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [u.id, randomUUID(), label]);
    return { id: u.id, employeeId: e.id, token: await jwt.signAsync({ sub: u.id, sid: s.id, roles: [RoleCode.Admin] }) };
  }
  async function call<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, who = admin): Promise<{ status: number; body: T }> {
    const r = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${who.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() as T };
  }
  function input(extra: Record<string, unknown> = {}): Record<string, unknown> { return { name: label, weekdays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00', ...extra }; }
  async function schedule(extra: Record<string, unknown> = {}): Promise<Schedule> { const r = await call<Schedule>('/work-schedules', 'POST', input(extra)); expect(r.status).toBe(201); return r.body; }
  const assign = (s: Schedule, p: Actor, from = '2020-01-01', to?: string): Promise<{ status: number; body: Record<string, unknown> }> => call(`/work-schedules/${s.id}/employee-assignments`, 'POST', { employeeId: p.employeeId, effectiveFrom: from, effectiveTo: to });
  async function events(p: Actor, date: string): Promise<void> {
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time,latitude,longitude) VALUES($1,'CHECK_IN','OFFICE',($2::date+time '08:00') AT TIME ZONE 'Asia/Bangkok',10,106),($1,'CHECK_OUT','OFFICE',($2::date+time '17:30') AT TIME ZONE 'Asia/Bangkok',10,106)`, [p.employeeId, date]);
  }
  async function daily(p: Actor, date: string): Promise<Daily> { const r = await call<Daily[]>(`/attendance/daily?date=${date}`); expect(r.status).toBe(200); return r.body.find(row => row.employeeId === p.employeeId)!; }

  it('creates default policy, deduplicates weekdays and records audit', async () => {
    const s = await schedule({ weekdays: [5, 1, 5] });
    expect(s).toMatchObject({ weekdays: [1, 5], lateToleranceMinutes: 3, earlyLeaveToleranceMinutes: 0, requiredWorkMinutes: 480 });
    expect(await db.query(`SELECT action FROM configuration_audit_logs WHERE resource_id=$1`, [s.id])).toEqual([{ action: 'CREATE' }]);
  });
  it('rejects blank/oversized names, null values, malformed weekdays and invalid same-day times', async () => {
    for (const extra of [{ name: '   ' }, { name: 'x'.repeat(121) }, { weekdays: [] }, { weekdays: [0] }, { weekdays: [8] }, { weekdays: null }, { startTime: '24:00' }, { endTime: '08:00' }, { endTime: '07:00' }, { requiredWorkMinutes: null }, { lateToleranceMinutes: null }]) {
      expect((await call('/work-schedules', 'POST', input(extra))).status, JSON.stringify(extra)).toBe(400);
    }
  });
  it('validates partial updates against stored PostgreSQL HH:mm:ss; rejects null and blank updates', async () => {
    const s = await schedule();
    expect((await call(`/work-schedules/${s.id}`, 'PATCH', { startTime: '17:00' })).status).toBe(400);
    for (const extra of [{ name: ' ' }, { name: null }, { weekdays: null }, { isActive: null }, { requiredWorkMinutes: null }]) expect((await call(`/work-schedules/${s.id}`, 'PATCH', extra)).status).toBe(400);
    expect((await call(`/work-schedules/${s.id}`, 'PATCH', { name: ` ${label} updated `, lateToleranceMinutes: 0 })).status).toBe(200);
  });
  it('guards all schedule APIs with live ADMIN role, not a forged JWT role', async () => {
    const p = await actor(), s = await schedule();
    for (const [path, method, body] of [
      ['/work-schedules', 'GET', undefined], ['/work-schedules/history', 'GET', undefined], ['/work-schedules', 'POST', input()],
      [`/work-schedules/${s.id}`, 'PATCH', { name: label }], [`/work-schedules/${s.id}/employee-assignments`, 'POST', { employeeId: p.employeeId, effectiveFrom: '2020-01-01' }],
      [`/work-schedules/${s.id}/department-assignments`, 'POST', { branchId: branch, departmentId: department, effectiveFrom: '2020-01-01' }],
    ] as const) expect((await call(path, method, body, p)).status).toBe(403);
  });
  it('validates real date-only ranges and rejects missing/inactive employees without writing', async () => {
    const p = await actor(), s = await schedule();
    for (const fields of [{ effectiveFrom: '2026-02-30' }, { effectiveFrom: '2026-01-01T00:00:00Z' }, { effectiveFrom: '2026-02-02', effectiveTo: '2026-02-01' }]) expect((await call(`/work-schedules/${s.id}/employee-assignments`, 'POST', { employeeId: p.employeeId, ...fields })).status).toBe(400);
    expect((await call(`/work-schedules/${s.id}/employee-assignments`, 'POST', { employeeId: randomUUID(), effectiveFrom: '2020-01-01' })).status).toBe(404);
    await db.query('UPDATE employees SET is_active=false,employment_end_date=CURRENT_DATE,employment_status_reason=$2,status_changed_at=now(),status_changed_by=$3 WHERE id=$1', [p.employeeId, label, admin.id]);
    expect((await assign(s, p)).status).toBe(404);
    expect(await db.query('SELECT id FROM employee_schedules WHERE employee_id=$1', [p.employeeId])).toEqual([]);
  });
  it('closes older open assignment atomically with audit; overlap rolls closure back', async () => {
    const p = await actor(), a = await schedule(), b = await schedule();
    const first = await assign(a, p); expect(first.status).toBe(201);
    expect((await assign(b, p, '2020-01-10', '2020-01-12')).status).toBe(201);
    const rows = await db.query<Array<{ effective_to: string }>>('SELECT effective_to::text FROM employee_schedules WHERE id=$1', [first.body.id]); expect(rows[0].effective_to).toBe('2020-01-09');
    expect(await db.query(`SELECT action FROM configuration_audit_logs WHERE resource_id=$1 ORDER BY created_at`, [first.body.id])).toEqual([{ action: 'ASSIGN' }, { action: 'CLOSE' }]);
    expect((await assign(a, p, '2020-01-11', '2020-01-15')).status).toBe(409);
  });
  it('serializes concurrent same-employee overlapping assignments on PostgreSQL', async () => {
    const p = await actor(), a = await schedule(), b = await schedule();
    // Force the vulnerable read-before-write window, independent of HTTP scheduling.
    await db.query(`CREATE FUNCTION r4_slow_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER r4_insert_delay BEFORE INSERT ON employee_schedules FOR EACH ROW EXECUTE FUNCTION r4_slow_insert()`);
    try {
      const r = await Promise.all([assign(a, p, '2020-01-01', '2020-01-10'), assign(b, p, '2020-01-01', '2020-01-10')]);
      expect(r.map(x => x.status).sort()).toEqual([201, 409]);
    } finally { await db.query('DROP TRIGGER r4_insert_delay ON employee_schedules'); await db.query('DROP FUNCTION r4_slow_insert()'); }
    expect((await db.query('SELECT id FROM employee_schedules WHERE employee_id=$1', [p.employeeId]))).toHaveLength(1);
  });
  it('serializes concurrent branch/department assignments; rejects inactive schedule/catalog', async () => {
    const [d] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28).toUpperCase(), label]);
    const a = await schedule(), b = await schedule();
    const body = { branchId: branch, departmentId: d.id, effectiveFrom: '2020-01-01', effectiveTo: '2020-01-10' };
    await db.query(`CREATE FUNCTION r4_slow_department_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER r4_department_delay BEFORE INSERT ON department_schedules FOR EACH ROW EXECUTE FUNCTION r4_slow_department_insert()`);
    try {
      const r = await Promise.all([a, b].map(s => call(`/work-schedules/${s.id}/department-assignments`, 'POST', body)));
      expect(r.map(x => x.status).sort()).toEqual([201, 409]);
    } finally { await db.query('DROP TRIGGER r4_department_delay ON department_schedules'); await db.query('DROP FUNCTION r4_slow_department_insert()'); }
    await call(`/work-schedules/${a.id}`, 'PATCH', { isActive: false });
    expect((await call(`/work-schedules/${a.id}/department-assignments`, 'POST', { ...body, effectiveFrom: '2020-02-01', effectiveTo: undefined })).status).toBe(404);
    await db.query('UPDATE departments SET is_active=false WHERE id=$1', [d.id]);
    expect((await call(`/work-schedules/${b.id}/department-assignments`, 'POST', { ...body, effectiveFrom: '2020-02-01', effectiveTo: undefined })).status).toBe(400);
  });
  it('honors employee priority including a non-working day, then resumes department after expiry', async () => {
    const p = await actor(), base = await schedule(), exception = await schedule({ weekdays: [2], requiredWorkMinutes: 300 });
    await db.query(`INSERT INTO department_schedules(branch_id,department_id,schedule_id,effective_from) VALUES($1,$2,$3,'2020-01-01')`, [branch, department, base.id]);
    expect((await assign(exception, p, '2020-01-06', '2020-01-07')).status).toBe(201);
    for (const date of ['2020-01-06', '2020-01-07', '2020-01-08']) await events(p, date);
    expect(await daily(p, '2020-01-06')).toMatchObject({ overtimeMinutes: 0 });
    expect(await daily(p, '2020-01-07')).toMatchObject({ requiredWorkMinutes: 300, overtimeMinutes: 0 });
    expect(await daily(p, '2020-01-08')).toMatchObject({ requiredWorkMinutes: 480, overtimeMinutes: 0 });
    const report = await call<Array<{ workDate: string; requiredWorkMinutes: number }>>(`/reporting/monthly?month=2020-01&employeeId=${p.employeeId}`);
    expect(report.status).toBe(200); expect(report.body.some(r => r.workDate === '2020-01-06')).toBe(false);
    expect(report.body.find(r => r.workDate === '2020-01-07')?.requiredWorkMinutes).toBe(300);
    expect(report.body.every(r => !('overtimeMinutes' in r) || r.overtimeMinutes === 0)).toBe(true);
  });
  it('uses the primary effective organization consistently in daily and monthly schedule selection', async () => {
    const p = await actor(), main = await schedule({ requiredWorkMinutes: 300 }), secondary = await schedule({ requiredWorkMinutes: 700 });
    const [d] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28).toUpperCase(), label]);
    const [primary] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28).toUpperCase(), label]);
    await db.query('UPDATE employee_organization_assignments SET department_id=$2 WHERE employee_id=$1', [p.employeeId, primary.id]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,false,'2020-01-05')`, [p.employeeId, branch, d.id]);
    await db.query(`INSERT INTO department_schedules(branch_id,department_id,schedule_id,effective_from) VALUES($1,$2,$3,'2019-01-01'),($1,$4,$5,'2020-01-05')`, [branch, primary.id, main.id, d.id, secondary.id]);
    await events(p, '2020-01-06');
    expect(await daily(p, '2020-01-06')).toMatchObject({ requiredWorkMinutes: 300 });
    const r = await call<Array<{ workDate: string; requiredWorkMinutes: number }>>(`/reporting/monthly?month=2020-01&employeeId=${p.employeeId}`);
    expect(r.body.find(row => row.workDate === '2020-01-06')?.requiredWorkMinutes).toBe(300);
  });

  it('preserves both changes and accurate before/after audits under concurrent partial updates', async () => {
    const s = await schedule();
    const result = await Promise.all([
      call(`/work-schedules/${s.id}`, 'PATCH', { lateToleranceMinutes: 7 }),
      call(`/work-schedules/${s.id}`, 'PATCH', { requiredWorkMinutes: 420 }),
    ]);
    expect(result.map(r => r.status)).toEqual([200, 200]);
    const [row] = await db.query<Array<{ late: number; required: number }>>('SELECT late_tolerance_minutes AS late,required_work_minutes AS required FROM work_schedules WHERE id=$1', [s.id]);
    expect(row).toEqual({ late: 7, required: 420 });
    const audits = await db.query<Array<{ old_value: Schedule; new_value: Schedule }>>(`SELECT old_value,new_value FROM configuration_audit_logs WHERE resource_id=$1 AND action='UPDATE' ORDER BY created_at`, [s.id]);
    expect(audits).toHaveLength(2); expect(audits[1].old_value).toEqual(audits[0].new_value);
  });

  it('rolls back automatic closure and audit when a later bounded assignment already overlaps', async () => {
    const p = await actor(), a = await schedule(), b = await schedule();
    // Legacy inconsistent data; the new request must not partially alter it.
    await db.query(`INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,effective_to) VALUES($1,$2,'2020-01-01',NULL),($1,$3,'2020-01-11','2020-01-15')`, [p.employeeId, a.id, b.id]);
    const r = await assign(b, p, '2020-01-10', '2020-01-12'); expect(r.status).toBe(409);
    const [old] = await db.query<Array<{ effective_to: string | null }>>(`SELECT effective_to::text FROM employee_schedules WHERE employee_id=$1 AND schedule_id=$2`, [p.employeeId, a.id]);
    expect(old.effective_to).toBe(null);
    expect(await db.query(`SELECT id FROM configuration_audit_logs WHERE resource_type='EMPLOYEE_SCHEDULE' AND resource_id IN (SELECT id FROM employee_schedules WHERE employee_id=$1)`, [p.employeeId])).toEqual([]);
  });

  it('does not apply a future personal assignment before its inclusive effective dates and lists its owner', async () => {
    const p = await actor(), s = await schedule({ requiredWorkMinutes: 360 });
    const result = await assign(s, p, '2020-01-07', '2020-01-07'); expect(result.status).toBe(201);
    await events(p, '2020-01-06'); await events(p, '2020-01-07');
    expect((await daily(p, '2020-01-06')).requiredWorkMinutes).toBe(480);
    expect((await daily(p, '2020-01-07')).requiredWorkMinutes).toBe(360);
    const list = await call<Array<Schedule & { employeeAssignmentCount: number; employeeAssignments: { employeeId: string; effectiveFrom: string; effectiveTo: string }[] }>>('/work-schedules');
    const item = list.body.find(x => x.id === s.id)!;
    expect(item.employeeAssignmentCount).toBe(1);
    expect(item.employeeAssignments[0]).toMatchObject({ employeeId: p.employeeId, effectiveFrom: '2020-01-07', effectiveTo: '2020-01-07' });
  });
});
