import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface Actor { id: string; employeeId: string; token: string }
interface RequestRow { id: string; status: string; routeVersion: number; requestedMinutes: number; approvalStage: string; confirmedBy: string | null; reviewedBy: string | null }
interface Policy { id: string; code: string }
interface Balance { initialized: boolean; entitlementMinutes: number; carryOverMinutes: number; adjustmentMinutes: number; approvedMinutes: number; pendingMinutes: number; availableMinutes: number; policyId: string; employeeId: string }
interface Layout { owner: Actor; leader: Actor; head: Actor; other: Actor; policy: Policy; teamId: string; departmentId: string; branchId: string; date: string }
const label = 'R9 development-only acceptance';
const base = '/leave-requests';

// Explicit opt-in, synthetic identities and disposable local DB/API. No customer mutations.
describe.skipIf(process.env.R9_POSTGRES_TEST !== '1')('R9 leave/balances — isolated PostgreSQL and real HTTP', () => {
  const name = `r9_leave_test_${randomUUID().replaceAll('-', '')}`;
  const secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let db: DataSource, maintenance: DataSource, child: ChildProcess | undefined;
  let created = false, api = '', admin: Actor, fixtureIndex = 0;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R9 requires local development PostgreSQL');
    maintenance = new DataSource({ type: 'postgres', url: url.toString() });
    await maintenance.initialize(); await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString() });
    await db.initialize(); await db.runMigrations();
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done()));
    api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R9_API_ENTRY ?? 'dist/r9/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret,
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', CORS_ORIGIN: 'http://localhost:3000',
    } });
    for (let i = 0; i < 250; i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated R9 API first');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { admin = await actor(true); return; }
      await delay(100);
    }
    throw new Error('R9 readiness timeout');
  }, 40_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r9_leave_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  }, 15_000);

  async function actor(isAdmin = false): Promise<Actor> {
    const [user] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r9-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [user.id, isAdmin ? 'ADMIN' : 'EMPLOYEE']);
    const [employee] = await db.query<Array<{ id: string }>>('INSERT INTO employees(employee_code,full_name,user_id) VALUES($1,$2,$3) RETURNING id', [randomUUID().slice(0, 28), label, user.id]);
    const [session] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [user.id, randomUUID(), label]);
    return { id: user.id, employeeId: employee.id, token: await jwt.signAsync({ sub: user.id, sid: session.id, roles: ['ADMIN'] }, { expiresIn: 900 }) };
  }
  async function call<T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, person = admin): Promise<{ status: number; body: T }> {
    const result = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${person.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    return { status: result.status, body: await result.json() as T };
  }
  function policyInput(extra = {}): object { return { code: `R9_${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`, name: label, balanceTrackingEnabled: true, annualEntitlementMinutes: 960, dayMinutes: 480, carryOverEnabled: false, maxCarryOverMinutes: 0, allowHalfDay: true, allowHourly: true, allowApprovedCancellation: true, minimumNoticeDays: 0, ...extra }; }
  async function policy(extra = {}): Promise<Policy> { const r = await call<Policy>(`${base}/policies`, 'POST', policyInput(extra)); expect(r.status).toBe(201); return r.body; }
  async function layout(extra = {}): Promise<Layout> {
    const owner = await actor(), leader = await actor(), head = await actor(), other = await actor();
    const [department] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const [branch] = await db.query<Array<{ id: string }>>('INSERT INTO branches(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    const team = await call<{ id: string }>('/organization/teams', 'POST', { departmentId: department.id, code: randomUUID().slice(0, 28), name: label }); expect(team.status).toBe(201);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from) VALUES($1,$2,$3,true,'2020-01-01')`, [owner.employeeId, department.id, branch.id]);
    expect((await call(`/organization/teams/${team.body.id}/members`, 'POST', { employeeId: owner.employeeId })).status).toBe(201);
    for (const [person, role] of [[leader, 'TEAM_LEADER'], [head, 'DEPARTMENT_HEAD']] as const) {
      expect((await call('/organization/grants', 'POST', { employeeId: person.employeeId, roleCode: role, ...(role === 'TEAM_LEADER' ? { teamId: team.body.id } : { departmentId: department.id }), appointmentType: 'OFFICIAL', validFrom: '2020-01-01T00:00:00Z', reason: label })).status).toBe(201);
    }
    const date = new Date(Date.UTC(2030, fixtureIndex++, 15)).toISOString().slice(0, 10);
    return { owner, leader, head, other, policy: await policy(extra), teamId: team.body.id, departmentId: department.id, branchId: branch.id, date };
  }
  const route = (x: Layout, expectedVersion = 0): object => ({ teamId: x.teamId, leaderUserId: x.leader.id, headUserId: x.head.id, reason: label, expectedVersion });
  const input = (x: Layout, extra = {}): object => ({ policyId: x.policy.id, startDate: x.date, endDate: x.date, durationType: 'FULL_DAY', reason: label, ...extra });
  async function submit(x: Layout, extra = {}, routed = false): Promise<RequestRow> {
    if (routed) expect((await call(`${base}/routes/${x.owner.employeeId}`, 'PUT', route(x))).status).toBe(200);
    const r = await call<RequestRow>(`${base}/mine`, 'POST', input(x, extra), x.owner); expect(r.status).toBe(201); return r.body;
  }
  async function confirm(x: Layout, item: RequestRow): Promise<RequestRow> { const r = await call<RequestRow>(`${base}/${item.id}/confirm`, 'PATCH', { expectedVersion: item.routeVersion }, x.leader); expect(r.status).toBe(200); return r.body; }
  const decision = (x: Layout, item: RequestRow, person = admin, extra = {}): Promise<{ status: number; body: RequestRow }> => call<RequestRow>(`${base}/${item.id}/review`, 'PATCH', { status: 'APPROVED', expectedVersion: item.routeVersion, ...(person.id === admin.id ? { adminOverrideReason: label } : {}), ...extra }, person);
  const cancel = (x: Layout, item: RequestRow, person = x.owner, reason = label): Promise<{ status: number; body: RequestRow }> => call<RequestRow>(`${base}/${item.id}/cancel`, 'POST', { reason }, person);
  async function balance(x: Layout, year = Number(x.date.slice(0, 4))): Promise<Balance> { const r = await call<Balance[]>(`${base}/mine/balances?year=${year}`, 'GET', undefined, x.owner); expect(r.status).toBe(200); return r.body.find(b => b.policyId === x.policy.id)!; }
  const audit = (id: string, action: string): Promise<Array<{ id: string }>> => db.query('SELECT id FROM configuration_audit_logs WHERE resource_id=$1 AND action=$2', [id, action]);
  async function schedule(x: Layout, minutes = 480, weekdays = [1, 2, 3, 4, 5, 6, 7], personal = true, from = '2020-01-01', until: string | null = null): Promise<string> {
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO work_schedules(name,start_time,end_time,weekdays,required_work_minutes) VALUES($1,'08:00','17:00',$2,$3) RETURNING id`, [label, weekdays, minutes]);
    if (personal) await db.query('INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,effective_to) VALUES($1,$2,$3,$4)', [x.owner.employeeId, s.id, from, until]);
    else await db.query('INSERT INTO department_schedules(branch_id,department_id,schedule_id,effective_from,effective_to) VALUES($1,$2,$3,$4,$5)', [x.branchId, x.departmentId, s.id, from, until]);
    return s.id;
  }

  it('reserves SUBMITTED, keeps reservation on confirm, consumes on approval, refunds exactly once on cancellation', async () => {
    const x = await layout(), item = await submit(x, {}, true);
    expect(await balance(x)).toMatchObject({ initialized: true, pendingMinutes: 480, approvedMinutes: 0, availableMinutes: 480 });
    const confirmed = await confirm(x, item); expect((await balance(x)).pendingMinutes).toBe(480);
    expect((await decision(x, confirmed, x.head)).status).toBe(200);
    expect(await balance(x)).toMatchObject({ pendingMinutes: 0, approvedMinutes: 480, availableMinutes: 480 });
    expect((await cancel(x, confirmed)).status).toBe(201);
    expect(await balance(x)).toMatchObject({ pendingMinutes: 0, approvedMinutes: 0, availableMinutes: 960 });
    expect((await cancel(x, confirmed)).status).toBe(409); expect(await audit(item.id, 'CANCEL')).toHaveLength(1);
  });
  it('rejection releases reserved balance and permits a new request for the same date', async () => {
    const x = await layout(), item = await submit(x);
    expect((await decision(x, item, admin, { status: 'REJECTED', reviewNote: label })).status).toBe(200);
    expect((await balance(x)).availableMinutes).toBe(960);
    expect((await submit(x)).requestedMinutes).toBe(480);
  });
  it('serializes duplicate submissions and retains date-level overlap across half-days and policies', async () => {
    const x = await layout(), results = await Promise.all([1, 2].map(() => call<RequestRow>(`${base}/mine`, 'POST', input(x, { durationType: 'HALF_DAY', halfDayPeriod: 'AM' }), x.owner)));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const otherPolicy = await policy({ balanceTrackingEnabled: false });
    expect((await call(`${base}/mine`, 'POST', input(x, { durationType: 'HALF_DAY', halfDayPeriod: 'PM', policyId: otherPolicy.id }), x.owner)).status).toBe(409);
    expect((await balance(x)).pendingMinutes).toBe(240);
  });
  it('concurrent requests on separate dates cannot reserve beyond entitlement', async () => {
    const x = await layout({ annualEntitlementMinutes: 60 }), results = await Promise.all(['15', '16'].map(day => call(`${base}/mine`, 'POST', input(x, { startDate: `${x.date.slice(0, 8)}${day}`, endDate: `${x.date.slice(0, 8)}${day}`, durationType: 'HOURS', startTime: '08:00', endTime: '09:00' }), x.owner)));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(await balance(x)).toMatchObject({ pendingMinutes: 60, availableMinutes: 0 });
  });
  it('negative adjustment racing submission never causes an overdraft', async () => {
    const x = await layout({ annualEntitlementMinutes: 480 });
    const results = await Promise.all([call(`${base}/mine`, 'POST', input(x), x.owner), call(`${base}/balances/adjust`, 'POST', { employeeId: x.owner.employeeId, policyId: x.policy.id, year: Number(x.date.slice(0, 4)), deltaMinutes: -480, reason: label })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect((await balance(x)).availableMinutes).toBe(0);
  });
  it('concurrent initialization is idempotent, and auto-initialization has exactly one audit', async () => {
    const x = await layout(), body = { year: Number(x.date.slice(0, 4)), policyId: x.policy.id };
    await Promise.all([1, 2].map(() => call(`${base}/balances/initialize`, 'POST', body)));
    const [b] = await db.query<Array<{ id: string }>>('SELECT id FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2', [x.owner.employeeId, x.policy.id]);
    expect(await audit(b.id, 'INITIALIZE')).toHaveLength(1);
    const y = await layout(); await submit(y);
    const [auto] = await db.query<Array<{ id: string }>>('SELECT id FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2', [y.owner.employeeId, y.policy.id]);
    expect(await audit(auto.id, 'INITIALIZE')).toHaveLength(1);
  });
  it('concurrent confirmations and opposite final decisions create a single decision and inbox', async () => {
    const x = await layout(), item = await submit(x, {}, true), confirmations = await Promise.all([1, 2].map(() => call<RequestRow>(`${base}/${item.id}/confirm`, 'PATCH', { expectedVersion: item.routeVersion }, x.leader)));
    expect(confirmations.map(r => r.status).sort()).toEqual([200, 409]);
    const next = confirmations.find(r => r.status === 200)!.body, results = await Promise.all([decision(x, next, x.head), decision(x, next, x.head, { status: 'REJECTED', reviewNote: label })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]); expect(await audit(item.id, 'HEAD_REVIEW')).toHaveLength(1);
    const notices = await db.query<Array<{ id: string }>>(`SELECT a.id FROM announcements a JOIN announcement_recipients r ON r.announcement_id=a.id WHERE r.employee_id=$1 AND a.title IN ('Nghỉ phép đã được duyệt','Nghỉ phép bị từ chối')`, [x.owner.employeeId]); expect(notices).toHaveLength(1);
    expect((await balance(x)).pendingMinutes).toBe(0);
  });
  for (const allowApprovedCancellation of [true, false]) {
    it(`cancel versus approval serializes and balance matches the winner (approved cancellation ${allowApprovedCancellation})`, async () => {
      const x = await layout({ allowApprovedCancellation }), item = await confirm(x, await submit(x, {}, true));
      const results = await Promise.all([decision(x, item, x.head), cancel(x, item)]);
      expect(results.some(r => r.status >= 500)).toBe(false);
      const [saved] = await db.query<Array<{ status: string }>>('SELECT status FROM leave_requests WHERE id=$1', [item.id]);
      expect(['APPROVED', 'CANCELLED']).toContain(saved.status);
      if (allowApprovedCancellation) expect(saved.status).toBe('CANCELLED');
      expect(await balance(x)).toMatchObject({ pendingMinutes: 0, approvedMinutes: saved.status === 'APPROVED' ? 480 : 0, availableMinutes: saved.status === 'APPROVED' ? 480 : 960 });
      expect((await audit(item.id, 'HEAD_REVIEW')).length).toBeLessThanOrEqual(1); expect((await audit(item.id, 'CANCEL')).length).toBeLessThanOrEqual(1);
    });
  }
  it('double cancellation only refunds once; Admin cannot bypass approved-cancellation policy', async () => {
    const x = await layout(), item = await submit(x), results = await Promise.all([1, 2].map(() => cancel(x, item)));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect((await balance(x)).availableMinutes).toBe(960);
    const y = await layout({ allowApprovedCancellation: false }), approved = await submit(y); expect((await decision(y, approved)).status).toBe(200);
    for (const person of [y.owner, admin]) expect((await cancel(y, approved, person)).status).toBe(409);
    expect((await balance(y)).approvedMinutes).toBe(480);
  });
  it('checks assigned actors, independent order, owner-only cancellation and Admin fallback eligibility', async () => {
    const x = await layout(), item = await submit(x, {}, true);
    for (const person of [x.owner, x.other, x.head, admin]) expect((await call(`${base}/${item.id}/confirm`, 'PATCH', { expectedVersion: item.routeVersion }, person)).status).toBe(403);
    expect((await decision(x, item)).status).toBe(403); expect((await decision(x, item, x.head)).status).toBe(403);
    expect((await cancel(x, item, x.other)).status).toBe(403);
    expect((await call(`${base}/balances`, 'GET', undefined, x.owner)).status).toBe(403);
    expect((await call(`${base}/policies`, 'POST', policyInput(), x.owner)).status).toBe(403);
    const balances = await call<Balance[]>(`${base}/mine/balances?year=${x.date.slice(0, 4)}`, 'GET', undefined, x.other); expect(balances.body.every(b => b.employeeId === x.other.employeeId)).toBe(true);
    expect((await call(`${base}/${item.id}/history`, 'GET', undefined, x.other)).status).toBe(404);
  });
  it('revoked Head cannot decide; Admin fallback preserves confirmation and consumes the same reserved amount', async () => {
    const x = await layout(), item = await confirm(x, await submit(x, {}, true));
    await db.query('UPDATE organization_management_grants SET revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE user_id=$1', [x.head.id, admin.id, label]);
    expect((await decision(x, item, x.head)).status).toBe(403);
    await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='ADMIN'", [x.owner.id]);
    expect((await decision(x, item, x.owner, { adminOverrideReason: label })).status).toBe(403);
    const done = await decision(x, item); expect(done.status).toBe(200); expect(done.body.confirmedBy).toBe(x.leader.id);
    expect(await balance(x)).toMatchObject({ approvedMinutes: 480, pendingMinutes: 0, availableMinutes: 480 });
  });
  it('uses exact half-day/hour minutes and rejects disabled, oversized and cross-date partial requests', async () => {
    const x = await layout({ dayMinutes: 361 }); await schedule(x, 360);
    const item = await submit(x, { durationType: 'HALF_DAY', halfDayPeriod: 'AM' }); expect(item.requestedMinutes).toBe(180); await cancel(x, item);
    expect((await submit(x, { durationType: 'HOURS', startTime: '08:15', endTime: '10:01' })).requestedMinutes).toBe(106);
    const y = await layout({ allowHalfDay: false, allowHourly: false });
    for (const extra of [{ durationType: 'HALF_DAY', halfDayPeriod: 'PM' }, { durationType: 'HOURS', startTime: '08:00', endTime: '09:00' }]) expect((await call(`${base}/mine`, 'POST', input(y, extra), y.owner)).status).toBe(400);
    for (const extra of [{ durationType: 'HOURS', startTime: '08:00', endTime: '17:00' }, { durationType: 'HALF_DAY', halfDayPeriod: 'AM', endDate: `${x.date.slice(0, 8)}16` }]) expect((await call(`${base}/mine`, 'POST', input(x, extra), x.owner)).status).toBe(400);
  });
  it('selects the personal schedule before weekdays; non-working days are zero, not department fallback', async () => {
    const x = await layout(); await schedule(x, 480, [1, 2, 3, 4, 5, 6, 7], false);
    const weekday = Number(await db.query<Array<{ weekday: number }>>('SELECT extract(isodow from $1::date)::int weekday', [x.date]).then(rows => rows[0].weekday));
    await schedule(x, 360, [weekday === 7 ? 1 : weekday + 1]);
    for (const extra of [{}, { durationType: 'HALF_DAY', halfDayPeriod: 'AM' }, { durationType: 'HOURS', startTime: '08:00', endTime: '09:00' }]) expect((await call(`${base}/mine`, 'POST', input(x, extra), x.owner)).status).toBe(400);
    expect((await balance(x)).pendingMinutes).toBe(0);
  });
  it('uses policy fallback per unscheduled day, but never charges scheduled rest days in a range', async () => {
    const x = await layout({ annualEntitlementMinutes: 2000 });
    await schedule(x, 360, [1, 2, 3, 4, 5, 6, 7], true, x.date, x.date);
    expect((await submit(x, { endDate: `${x.date.slice(0, 8)}16` })).requestedMinutes).toBe(840);
    const y = await layout({ annualEntitlementMinutes: 2000 });
    const weekday = (await db.query<Array<{ weekday: number }>>('SELECT extract(isodow from $1::date)::int weekday', [y.date]))[0].weekday;
    await schedule(y, 360, [weekday]);
    expect((await submit(y, { endDate: `${y.date.slice(0, 8)}16` })).requestedMinutes).toBe(360);
  });
  it('rejects required policy PATCH nulls, whitespace reasons and non-calendar/date-time dates without 500', async () => {
    const x = await layout();
    for (const body of [{ dayMinutes: null }, { annualEntitlementMinutes: null }, { name: null }, { isActive: null }, { balanceTrackingEnabled: null }, { name: '  ' }]) expect((await call(`${base}/policies/${x.policy.id}`, 'PATCH', body)).status).toBe(400);
    expect((await call(`${base}/mine`, 'POST', input(x, { reason: '   ' }), x.owner)).status).toBe(400);
    for (const date of ['2030-02-31', '2030-01-15T08:00:00Z', '2201-01-01', '0000-01-01']) expect((await call(`${base}/mine`, 'POST', input(x, { startDate: date, endDate: date }), x.owner)).status).toBe(400);
    const item = await submit(x); expect((await cancel(x, item, x.owner, '     ')).status).toBe(400);
    expect((await call(`${base}/balances/adjust`, 'POST', { employeeId: x.owner.employeeId, policyId: x.policy.id, year: Number(x.date.slice(0, 4)), deltaMinutes: 1, reason: '     ' })).status).toBe(400);
    expect((await call(`${base}/not-a-uuid/cancel`, 'POST', { reason: label }, x.owner)).status).toBe(400);
    expect((await call(`${base}/policies/not-a-uuid`, 'PATCH', { name: label })).status).toBe(400);
  });
  it('concurrent duplicate policy codes return conflict rather than unique constraint 500', async () => {
    const body = policyInput(), results = await Promise.all([1, 2, 3].map(() => call(`${base}/policies`, 'POST', body)));
    expect(results.map(r => r.status).sort()).toEqual([201, 409, 409]);
  });
  it('carry-over honors approved/pending/adjustment usage, cap and immutable initialized entitlement', async () => {
    const x = await layout({ carryOverEnabled: true, maxCarryOverMinutes: 240 });
    const year = Number(x.date.slice(0, 4));
    const [previous] = await db.query<Array<{ id: string }>>('INSERT INTO employee_leave_balances(employee_id,policy_id,balance_year,entitlement_minutes) VALUES($1,$2,$3,1000) RETURNING id', [x.owner.employeeId, x.policy.id, year - 1]);
    await db.query('INSERT INTO leave_balance_adjustments(balance_id,delta_minutes,reason,created_by) VALUES($1,-180,$2,$3)', [previous.id, label, admin.id]);
    for (const [day, status, minutes] of [[1, 'APPROVED', 480], [2, 'SUBMITTED', 240]] as const) {
      await db.query(`INSERT INTO leave_requests(employee_id,policy_id,leave_type,start_date,end_date,reason,status,requested_minutes,submitted_by)
        VALUES($1,$2,$3,$4::date,$4::date,$5,$6,$7,$8)`, [x.owner.employeeId, x.policy.id, x.policy.code, `${year - 1}-12-0${day}`, label, status, minutes, x.owner.id]);
    }
    const body = { year, policyId: x.policy.id };
    const results = await Promise.all([1, 2].map(() => call(`${base}/balances/initialize`, 'POST', body))); expect(results.every(r => r.status === 201)).toBe(true);
    expect(await balance(x)).toMatchObject({ carryOverMinutes: 100, entitlementMinutes: 960, availableMinutes: 1060 });
    expect((await call(`${base}/policies/${x.policy.id}`, 'PATCH', { annualEntitlementMinutes: 480 })).status).toBe(200);
    expect((await balance(x)).entitlementMinutes).toBe(960);
    const [count] = await db.query<Array<{ count: number }>>('SELECT count(*)::int count FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2 AND balance_year=$3', [x.owner.employeeId, x.policy.id, year]); expect(count.count).toBe(1);
    const y = await layout({ carryOverEnabled: true, maxCarryOverMinutes: 240 }), nextYear = Number(y.date.slice(0, 4));
    await db.query('INSERT INTO employee_leave_balances(employee_id,policy_id,balance_year,entitlement_minutes) VALUES($1,$2,$3,1000)', [y.owner.employeeId, y.policy.id, nextYear - 1]);
    expect((await call(`${base}/balances/initialize`, 'POST', { year: nextYear, policyId: y.policy.id })).status).toBe(201);
    expect((await balance(y)).carryOverMinutes).toBe(240);
  });
  it('locked months reject creation/cancel/review and pending requests block the real closing API', async () => {
    const x = await layout(); await schedule(x); const item = await submit(x);
    expect((await call(`/reporting/periods/${x.date.slice(0, 7)}/lock`, 'POST', { reason: label })).status).toBe(409);
    await db.query("UPDATE attendance_periods SET status='LOCKED',locked_by=$2,locked_at=now() WHERE period_month=date_trunc('month',$1::date)", [x.date, admin.id]);
    for (const result of [await cancel(x, item), await decision(x, item), await call(`${base}/mine`, 'POST', input(x, { startDate: `${x.date.slice(0, 8)}16`, endDate: `${x.date.slice(0, 8)}16` }), x.owner)]) expect(result.status).toBe(409);
    expect((await balance(x)).pendingMinutes).toBe(480);
  });
  it('audit failure rolls back approval, cancellation, balance usage and decision inbox', async () => {
    const x = await layout(), item = await submit(x);
    await db.query(`CREATE FUNCTION r9_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='${item.id}'::uuid AND NEW.action IN ('ADMIN_FALLBACK_REVIEW','CANCEL') THEN RAISE EXCEPTION 'R9_TEST_AUDIT'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER r9_fail_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r9_fail_audit()');
    try { expect((await decision(x, item)).status).toBe(500); expect((await cancel(x, item)).status).toBe(500); }
    finally { await db.query('DROP TRIGGER r9_fail_audit ON configuration_audit_logs'); await db.query('DROP FUNCTION r9_fail_audit()'); }
    expect(await balance(x)).toMatchObject({ pendingMinutes: 480, approvedMinutes: 0, availableMinutes: 480 });
    const [saved] = await db.query<Array<{ status: string }>>('SELECT status FROM leave_requests WHERE id=$1', [item.id]); expect(saved.status).toBe('SUBMITTED');
    expect(await audit(item.id, 'ADMIN_FALLBACK_REVIEW')).toHaveLength(0); expect(await audit(item.id, 'CANCEL')).toHaveLength(0);
    expect((await db.query<Array<{ announcement_id: string }>>('SELECT announcement_id FROM announcement_recipients WHERE employee_id=$1', [x.owner.employeeId])).length).toBe(0);
  });
  it('uses the primary department, not a newer secondary assignment, for all duration types', async () => {
    const x = await layout(); await schedule(x, 360, [1, 2, 3, 4, 5, 6, 7], false);
    const [secondary] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [randomUUID().slice(0, 28), label]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from) VALUES($1,$2,$3,false,'2029-01-01')`, [x.owner.employeeId, secondary.id, x.branchId]);
    await schedule({ ...x, departmentId: secondary.id }, 600, [1, 2, 3, 4, 5, 6, 7], false);
    const item = await submit(x); expect(item.requestedMinutes).toBe(360); await cancel(x, item);
    const half = await submit(x, { durationType: 'HALF_DAY', halfDayPeriod: 'PM' }); expect(half.requestedMinutes).toBe(180);
  });
  it('rechecks insufficient legacy balance during approval without changing reservation/decision/audit', async () => {
    const x = await layout(), item = await submit(x);
    const [b] = await db.query<Array<{ id: string }>>('SELECT id FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2', [x.owner.employeeId, x.policy.id]);
    // Adversarial legacy fixture, not a permitted API adjustment.
    await db.query('INSERT INTO leave_balance_adjustments(balance_id,delta_minutes,reason,created_by) VALUES($1,-600,$2,$3)', [b.id, label, admin.id]);
    expect((await decision(x, item)).status).toBe(409); expect(await audit(item.id, 'ADMIN_FALLBACK_REVIEW')).toHaveLength(0);
    expect((await balance(x)).pendingMinutes).toBe(480);
  });
  it('checks notice, policy flags and year crossing; untracked leave does not initialize/deduct a balance', async () => {
    const x = await layout({ minimumNoticeDays: 2 }), today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    expect((await call(`${base}/mine`, 'POST', input(x, { startDate: today, endDate: today }), x.owner)).status).toBe(409);
    expect((await call(`${base}/mine`, 'POST', input(x, { startDate: '2040-12-31', endDate: '2041-01-01' }), x.owner)).status).toBe(400);
    const y = await layout({ balanceTrackingEnabled: false });
    expect((await submit(y, { startDate: '2040-12-31', endDate: '2041-01-01' })).requestedMinutes).toBe(960);
    expect((await db.query<Array<{ id: string }>>('SELECT id FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2', [y.owner.employeeId, y.policy.id])).length).toBe(0);
    expect((await call(`${base}/policies`, 'POST', policyInput({ balanceTrackingEnabled: false, carryOverEnabled: true }))).status).toBe(400);
  });
  it('policy edits do not recalculate submitted minutes or initialized entitlement; null/blank rejection rolls back', async () => {
    const x = await layout(), item = await submit(x);
    expect((await call(`${base}/policies/${x.policy.id}`, 'PATCH', { dayMinutes: 600, annualEntitlementMinutes: 1000 })).status).toBe(200);
    expect((await decision(x, item)).status).toBe(200);
    expect(await balance(x)).toMatchObject({ entitlementMinutes: 960, approvedMinutes: 480, availableMinutes: 480 });
    expect((await call(`${base}/policies/${x.policy.id}`, 'PATCH', { isActive: false })).status).toBe(200);
    expect((await call(`${base}/mine`, 'POST', input(x, { startDate: `${x.date.slice(0, 8)}16`, endDate: `${x.date.slice(0, 8)}16` }), x.owner)).status).toBe(400);
    expect((await cancel(x, item)).status).toBe(201); // Deactivation does not erase the existing policy/cancellation permission.
  });
  it('creation waiting for a month lock rechecks committed LOCKED and does not reserve any balance', async () => {
    const x = await layout(), runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    let request: Promise<{ status: number; body: Record<string, unknown> }> | undefined;
    try {
      await runner.query("INSERT INTO attendance_periods(period_month,status) VALUES(date_trunc('month',$1::date),'OPEN')", [x.date]);
      request = call(`${base}/mine`, 'POST', input(x), x.owner);
      let waiting = false;
      for (let i = 0; i < 80 && !waiting; i++) {
        const [row] = await db.query<Array<{ waiting: boolean }>>(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO attendance_periods%') waiting`, [name]);
        waiting = row.waiting; if (!waiting) await delay(25);
      }
      expect(waiting).toBe(true);
      await runner.query("UPDATE attendance_periods SET status='LOCKED',locked_by=$2,locked_at=now() WHERE period_month=date_trunc('month',$1::date)", [x.date, admin.id]);
      await runner.commitTransaction(); expect((await request).status).toBe(409);
    } finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await request?.catch(() => undefined); await runner.release(); }
    expect((await balance(x)).pendingMinutes).toBe(0);
  });
  it('initialization, submission and policy editing do not deadlock or create duplicate owner balances', async () => {
    const x = await layout(), results = await Promise.all([
      call(`${base}/balances/initialize`, 'POST', { year: Number(x.date.slice(0, 4)), policyId: x.policy.id }),
      call(`${base}/policies/${x.policy.id}`, 'PATCH', { name: `${label} edited` }),
      call(`${base}/mine`, 'POST', input(x), x.owner),
    ]);
    expect(results.map(r => r.status)).toEqual([201, 200, 201]);
    const balances = await db.query<Array<{ id: string }>>('SELECT id FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2', [x.owner.employeeId, x.policy.id]);
    expect(balances).toHaveLength(1); expect(await audit(balances[0].id, 'INITIALIZE')).toHaveLength(1);
    expect((await balance(x)).pendingMinutes).toBe(480);
  });
  it('uninitialized balance preview includes carry-over, matches initialization, and does not write on GET', async () => {
    const x = await layout({ annualEntitlementMinutes: 0, carryOverEnabled: true, maxCarryOverMinutes: 240 }), year = Number(x.date.slice(0, 4));
    await db.query('INSERT INTO employee_leave_balances(employee_id,policy_id,balance_year,entitlement_minutes) VALUES($1,$2,$3,600)', [x.owner.employeeId, x.policy.id, year - 1]);
    expect(await balance(x)).toMatchObject({ initialized: false, carryOverMinutes: 240, availableMinutes: 240 });
    expect((await db.query<Array<{ id: string }>>('SELECT id FROM employee_leave_balances WHERE employee_id=$1 AND policy_id=$2 AND balance_year=$3', [x.owner.employeeId, x.policy.id, year])).length).toBe(0);
    await submit(x, { durationType: 'HOURS', startTime: '08:00', endTime: '09:00' });
    expect(await balance(x)).toMatchObject({ initialized: true, carryOverMinutes: 240, availableMinutes: 180, pendingMinutes: 60 });
  });
  it('a cross-month request cannot change if either affected month is locked', async () => {
    const x = await layout({ annualEntitlementMinutes: 2000 }), extra = { startDate: '2050-11-30', endDate: '2050-12-01' };
    const item = await submit(x, extra); expect(item.requestedMinutes).toBe(960);
    await db.query("UPDATE attendance_periods SET status='LOCKED',locked_by=$1,locked_at=now() WHERE period_month='2050-12-01'", [admin.id]);
    expect((await cancel(x, item)).status).toBe(409); expect((await decision(x, item)).status).toBe(409);
    expect((await call(`${base}/mine`, 'POST', input(x, { startDate: '2050-11-29', endDate: '2050-12-02' }), x.owner)).status).toBe(409);
    expect((await balance(x, 2050)).pendingMinutes).toBe(960);
  });
});
