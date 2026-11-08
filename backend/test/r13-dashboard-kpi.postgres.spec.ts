import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { ReportingService, type DashboardSummary, type KpiDocument, type MonthlyDocument } from '../src/modules/reporting/reporting.service.js';
import { EmployeeAdminService } from '../src/modules/employees/employee-admin.service.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { summarizeMonthly, type MonthlySummary } from '../src/modules/reporting/domain/monthly-report.js';

interface Actor { id: string; employeeId: string; token: string; code: string }
interface Layout { admin: Actor; area: Actor; leader: Actor; head: Actor; member: Actor; northMember: Actor; sibling: Actor; outside: Actor; department: string; branch: string; north: string; team: string; grant: string }
interface ScopedReport { employees: Array<{ employeeId: string; leaveDays: number; partialLeaveDays: number; workedMinutes: number; overtimeMinutes: number }>; summary: MonthlySummary; source: string; revision: number | null }
const label = 'R13 DEVELOPMENT ONLY acceptance';

// Explicit opt-in: isolated local database/API, synthetic accounts and no SMTP/FCM.
describe.skipIf(process.env.R13_POSTGRES_TEST !== '1')('R13 Dashboard/KPI — PostgreSQL and authenticated HTTP', () => {
  const name = `r13_stats_test_${randomUUID().replaceAll('-', '')}`, secret = randomUUID().repeat(2), jwt = new JwtService({ secret });
  let db: DataSource, maintenance: DataSource, service: ReportingService, child: ChildProcess | undefined, created = false, api = '', today = '';
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R13 requires local development PostgreSQL');
    url.hostname = '127.0.0.1';
    maintenance = new DataSource({ type: 'postgres', url: url.toString() }); await maintenance.initialize();
    await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`; db = new DataSource({ ...applicationDataSource.options, url: url.toString() });
    await db.initialize(); await db.runMigrations(); service = new ReportingService(db);
    [ { today } ] = await db.query<Array<{ today: string }>>(`SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS today`);
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((done, reject) => probe.close(error => error ? reject(error) : done())); api = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, [process.env.R13_API_ENTRY ?? '../logs/r13-api-build/main.js'], { stdio: 'ignore', env: {
      ...process.env, DATABASE_URL: url.toString(), PORT: String(port), JWT_SECRET: secret, NODE_PATH: resolve('node_modules'),
      SMTP_HOST: '', SMTP_FROM: '', ADMIN_LOGIN_ALERT_EMAILS: '', FIREBASE_PUSH_ENABLED: 'false', CORS_ORIGIN: 'http://localhost:3000',
      EVIDENCE_STORAGE_DIR: resolve(`../logs/${name}/attendance`), BUSINESS_TRIP_EVIDENCE_STORAGE_DIR: resolve(`../logs/${name}/trips`),
    } });
    for (let i = 0; i < 180; i++) {
      if (child.exitCode !== null) throw new Error('Compile isolated R13 API before running this suite');
      if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) return;
      await delay(100);
    }
    throw new Error('Isolated R13 API readiness timed out');
  }, 30_000);
  afterAll(async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r13_stats_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  }, 15_000);
  async function call<T>(actor: Actor, path: string): Promise<{ status: number; body: T }> {
    const response = await fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${actor.token}` } });
    return { status: response.status, body: await response.json() as T };
  }
  async function actor(role = RoleCode.Employee): Promise<Actor> {
    const [u] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r13-${randomUUID()}@development.invalid`]);
    await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2', [u.id, role]);
    const code = randomUUID().slice(0, 28);
    const [e] = await db.query<Array<{ id: string }>>(`INSERT INTO employees(employee_code,full_name,user_id,phone) VALUES($1,$2,$3,'PRIVATE-CONTACT-NOT-RETURNED') RETURNING id`, [code, label, u.id]);
    const [s] = await db.query<Array<{ id: string }>>(`INSERT INTO auth_sessions(user_id,device_id,device_name,client_type,expires_at,login_alert_status) VALUES($1,$2,$3,'MOBILE',now()+interval '1 day','SKIPPED') RETURNING id`, [u.id, randomUUID(), label]);
    // Forged ADMIN claim deliberately tests that live DB roles, not claims, authorize endpoints.
    return { id: u.id, employeeId: e.id, code, token: await jwt.signAsync({ sub: u.id, sid: s.id, roles: [RoleCode.Admin] }) };
  }
  async function catalog(table: 'departments' | 'branches'): Promise<string> {
    const [r] = await db.query<Array<{ id: string }>>(`INSERT INTO ${table}(code,name) VALUES($1,$2) RETURNING id`, [randomUUID().slice(0, 28), label]); return r.id;
  }
  async function assignment(person: Actor, department: string, branch: string, from = '2020-01-01', until: string | null = null): Promise<void> {
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,is_primary,effective_from,effective_to) VALUES($1,$2,$3,false,$4,$5)`, [person.employeeId, department, branch, from, until]);
  }
  async function layout(): Promise<Layout> {
    const admin = await actor(RoleCode.Admin), area = await actor(RoleCode.AreaManager), leader = await actor(), head = await actor(), member = await actor(), northMember = await actor(), sibling = await actor(), outside = await actor();
    const department = await catalog('departments'), foreign = await catalog('departments'), branch = await catalog('branches'), north = await catalog('branches');
    await assignment(member, department, branch, '2020-01-01', today); await assignment(northMember, department, north); await assignment(sibling, department, north); await assignment(outside, foreign, north);
    await db.query('INSERT INTO user_branch_scopes(user_id,branch_id) VALUES($1,$2)', [area.id, branch]);
    const [t] = await db.query<Array<{ id: string }>>(`INSERT INTO organization_teams(department_id,code,name,created_by) VALUES($1,'R13',$2,$3) RETURNING id`, [department, label, admin.id]);
    for (const person of [member, northMember]) await db.query('INSERT INTO organization_team_memberships(team_id,employee_id,created_by) VALUES($1,$2,$3)', [t.id, person.employeeId, admin.id]);
    const [g] = await db.query<Array<{ id: string }>>(`INSERT INTO organization_management_grants(user_id,role_code,team_id,appointment_type,valid_from,reason,created_by) VALUES($1,'TEAM_LEADER',$2,'OFFICIAL','2020-01-01',$3,$4) RETURNING id`, [leader.id, t.id, label, admin.id]);
    await db.query(`INSERT INTO organization_management_grants(user_id,role_code,department_id,appointment_type,valid_from,reason,created_by) VALUES($1,'DEPARTMENT_HEAD',$2,'OFFICIAL','2020-01-01',$3,$4)`, [head.id, department, label, admin.id]);
    return { admin, area, leader, head, member, northMember, sibling, outside, department, branch, north, team: t.id, grant: g.id };
  }
  async function events(person: Actor, date: string, type = 'OFFICE', missing = false): Promise<void> {
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time,risk_flags) VALUES($1,'CHECK_IN',$2,$3,'{LATE}')`, [person.employeeId, type, `${date}T00:00:00+07:00`]);
    if (!missing) await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time,risk_flags) VALUES($1,'CHECK_OUT',$2,$3,'{EARLY_LEAVE}')`, [person.employeeId, type, `${date}T08:01:00+07:00`]);
  }
  async function leave(person: Actor, date: string, status = 'SUBMITTED'): Promise<void> {
    await db.query(`INSERT INTO leave_requests(employee_id,leave_type,policy_id,start_date,end_date,reason,status,duration_type,half_day_period,requested_minutes)
      SELECT $1,'ANNUAL',id,$2,$2,$3,$4,'HALF_DAY','AM',240 FROM leave_policies WHERE code='ANNUAL'`, [person.employeeId, date, label, status]);
  }
  async function overtime(person: Actor, admin: Actor, date: string, status = 'SUBMITTED'): Promise<void> {
    await db.query(`INSERT INTO overtime_requests(employee_id,submitted_by,submission_id,work_date,requested_minutes,reason,work_content,status) VALUES($1,$2,$3,$4,61,$5,$5,$6)`, [person.employeeId, person.id, randomUUID(), date, label, status]); void admin;
  }
  async function announcement(admin: Actor, recipients: Actor[], disciplinary = false): Promise<void> {
    const [a] = await db.query<Array<{ id: string }>>(`INSERT INTO announcements(title,body,status,audience_type,created_by,published_at) VALUES($1::text,$1::text,'PUBLISHED','ALL',$2,now()) RETURNING id`, [label, admin.id]);
    for (const person of recipients) await db.query(`INSERT INTO announcement_recipients(announcement_id,employee_id,delivered_at,push_status,push_failure_code) VALUES($1,$2,now(),'SKIPPED','R13_SEED_ONLY')`, [a.id, person.employeeId]);
    if (disciplinary) await db.query(`INSERT INTO employee_disciplinary_actions(employee_id,action_type,title,reason,decision,effective_from,created_by,announcement_id) VALUES($1,'WARNING',$2::text,$2::text,$2::text,$3,$4,$5)`, [recipients[0].employeeId, label, today, admin.id, a.id]);
  }
  it('Dashboard deduplicates daily risk events, matches effective report rows and never counts a trip as attendance', async () => {
    const x = await layout(); await events(x.member, today); await events(x.northMember, today, 'BUSINESS_TRIP', true);
    const result = await call<DashboardSummary>(x.area, '/reporting/dashboard'); expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ activeEmployees: 1, attendanceToday: 1, reviewRequired: 1, incompleteToday: 0, publishedAnnouncements: 0, workDate: today });
    const document = await call<MonthlyDocument>(x.admin, `/reporting/monthly/document?month=${today.slice(0, 7)}&employeeId=${x.member.employeeId}`);
    const daily = document.body.rows.filter(row => row.workDate === today);
    expect(result.body.reviewRequired).toBe(summarizeMonthly(daily, { openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 }, 0).reviewDays);
    const [trip] = await db.query<Array<{ id: string }>>(`INSERT INTO business_trips(code,site_name,site_address,start_at,end_at,content,status,created_by) VALUES($1,$2::text,$2::text,now(),now()+interval '1 day',$2::text,'ASSIGNED',$3) RETURNING id`, [randomUUID().slice(0, 28), label, x.admin.id]);
    await db.query('INSERT INTO business_trip_members(business_trip_id,employee_id) VALUES($1,$2)', [trip.id, x.member.employeeId]);
    const after = await call<DashboardSummary>(x.area, '/reporting/dashboard'); expect(after.body.attendanceToday).toBe(1); expect(after.body.activeTrips).toBe(1);
  });
  it('branch scope honors inclusive end dates, excludes future/expired assignments and inactive catalogues', async () => {
    const x = await layout(), future = await actor(), expired = await actor();
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,effective_from) VALUES($1,$2,$3,($4::date+1))`, [future.employeeId, x.department, x.branch, today]);
    await db.query(`INSERT INTO employee_organization_assignments(employee_id,department_id,branch_id,effective_from,effective_to) VALUES($1,$2,$3,'2020-01-01',($4::date-1))`, [expired.employeeId, x.department, x.branch, today]);
    expect((await call<DashboardSummary>(x.area, '/reporting/dashboard')).body.activeEmployees).toBe(1);
    await db.query('UPDATE branches SET is_active=false WHERE id=$1', [x.branch]);
    const empty = await call<DashboardSummary>(x.area, '/reporting/dashboard'); expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ activeEmployees: 0, attendanceToday: 0, reviewRequired: 0, publishedAnnouncements: 0 });
  });
  it('area/legacy managers do not see outside announcements or private discipline; no scope is zero not global', async () => {
    const x = await layout(); await announcement(x.admin, [x.member, x.northMember]); await announcement(x.admin, [x.outside]); await announcement(x.admin, [x.member], true);
    expect((await call<DashboardSummary>(x.area, '/reporting/dashboard')).body.publishedAnnouncements).toBe(1);
    const legacy = await actor(RoleCode.Manager); expect((await call<DashboardSummary>(legacy, '/reporting/dashboard')).body.publishedAnnouncements).toBe(0);
    const global = await call<DashboardSummary>(x.admin, '/reporting/dashboard'); expect(global.body.publishedAnnouncements).toBeGreaterThanOrEqual(3);
  });
  it('Leader/Head totals filter before aggregation, separate partial leave and include only approved OT', async () => {
    const x = await layout(), date = '2022-03-15', month = date.slice(0, 7);
    for (const person of [x.member, x.northMember, x.sibling, x.outside]) await events(person, date, 'BUSINESS_TRIP');
    await leave(x.member, date, 'APPROVED'); await overtime(x.member, x.admin, date, 'APPROVED'); await leave(x.outside, date); await overtime(x.outside, x.admin, date);
    await db.query(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,request_note,status) VALUES($1,$2,'OTHER',$3,'REQUESTED')`, [x.outside.employeeId, date, label]);
    const leader = await call<ScopedReport>(x.leader, `/organization/managed/reports?month=${month}`), head = await call<ScopedReport>(x.head, `/organization/managed/reports?month=${month}`);
    expect(leader.status).toBe(200); expect(head.status).toBe(200);
    expect(leader.body.employees.map(row => row.employeeId).sort()).toEqual([x.member.employeeId, x.northMember.employeeId].sort());
    expect(head.body.employees.map(row => row.employeeId).sort()).toEqual([x.member.employeeId, x.northMember.employeeId, x.sibling.employeeId].sort());
    expect(leader.body.summary).toMatchObject({ employeeCount: 2, leaveDays: 0, partialLeaveDays: 1, totalWorkedMinutes: 962, totalOvertimeMinutes: 61, pendingLeaveCount: 0, openExplanationCount: 0, pendingOvertimeCount: 0, blockerCount: 0 });
    expect(leader.body.employees.find(row => row.employeeId === x.member.employeeId)).toMatchObject({ leaveDays: 0, partialLeaveDays: 1, workedMinutes: 481, overtimeMinutes: 61 });
    for (const data of [leader.body, head.body]) expect(JSON.stringify(data)).not.toMatch(/PRIVATE-CONTACT|latitude|longitude|password|departmentId|lockedByName/);
    const kpi = await call<KpiDocument>(x.admin, `/kpi/monthly/document?month=${month}`);
    const report = await call<MonthlyDocument>(x.admin, `/reporting/monthly/document?month=${month}`); expect(kpi.body.summary).toEqual(report.body.summary);
    expect(kpi.body.rows.find(row => row.employeeId === x.member.employeeId)?.totalWorkedMinutes).toBe(481);
  });
  it('revoked/expired/inactive scopes disappear on the next request, with no global fallback', async () => {
    const x = await layout(); await events(x.member, '2022-04-15');
    expect((await call<ScopedReport>(x.leader, '/organization/managed/reports?month=2022-04')).body.summary.employeeCount).toBe(1);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [x.member.id]);
    expect((await call<ScopedReport>(x.leader, '/organization/managed/reports?month=2022-04')).body.summary.employeeCount).toBe(0);
    await db.query('UPDATE users SET is_active=true WHERE id=$1', [x.member.id]);
    await db.query(`UPDATE organization_management_grants SET valid_until=now()-interval '1 hour' WHERE id=$1`, [x.grant]);
    expect((await call<unknown>(x.leader, '/organization/managed/reports?month=2022-04')).status).toBe(403);
    await db.query(`UPDATE organization_management_grants SET valid_until=NULL,revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE id=$1`, [x.grant, x.admin.id, label]);
    expect((await call<unknown>(x.leader, '/organization/managed/reports?month=2022-04')).status).toBe(403);
  });
  it('KPI reads the same immutable revision as R12 after name edits, deletion and reopening', async () => {
    const admin = await actor(RoleCode.Admin), employee = await actor(), date = '2021-01-15', month = date.slice(0, 7); await events(employee, date); await overtime(employee, admin, date, 'APPROVED');
    const actorView: AuthenticatedUserView = { id: admin.id, employeeId: admin.employeeId, email: 'dev@development.invalid', displayName: label, roles: [RoleCode.Admin] };
    await service.lockPeriod(actorView, month, label);
    const before = await call<KpiDocument>(admin, `/kpi/monthly/document?month=${month}`); expect(before.body.source).toBe('SNAPSHOT'); expect(before.body.revision).toBe(1);
    await db.query('UPDATE employees SET full_name=$2 WHERE id=$1', [employee.employeeId, 'R13 changed development-only name']);
    const deletion = new EmployeeAdminService(db, {} as never, { drain: () => Promise.resolve(0) } as never), impact = await deletion.deletionImpact(actorView, employee.employeeId) as { confirmationToken: string };
    await deletion.delete(actorView, employee.employeeId, { employeeCode: employee.code, reason: label, confirmationToken: impact.confirmationToken });
    expect((await call<KpiDocument>(admin, `/kpi/monthly/document?month=${month}`)).body.rows).toEqual(before.body.rows);
    await service.reopenPeriod({ ...actorView, roles: [RoleCode.ChiefAccountant] }, month, label);
    const old = await call<KpiDocument>(admin, `/kpi/monthly/document?month=${month}&revision=1`), report = await call<MonthlyDocument>(admin, `/reporting/monthly/document?month=${month}&revision=1`);
    expect(old.body.summary).toEqual(report.body.summary); expect(old.body.rows).toEqual(before.body.rows);
    expect((await call<KpiDocument>(admin, `/kpi/monthly/document?month=${month}`)).body.rows).toEqual([]);
  });
  it('HTTP uses live roles, preserves accounting reads, rejects bad query and returns true empty data', async () => {
    const x = await layout(), accountant = await actor(RoleCode.ChiefAccountant);
    for (const person of [x.member, x.leader, x.area]) expect((await call<unknown>(person, '/kpi/monthly/document?month=2022-03')).status).toBe(403);
    expect((await call<unknown>(x.leader, '/reporting/dashboard')).status).toBe(403);
    expect((await call<unknown>(x.leader, '/reporting/monthly/export?month=2022-03')).status).toBe(403);
    expect((await call<unknown>(accountant, '/kpi/monthly/document?month=2022-03')).status).toBe(200);
    expect((await call<unknown>(x.admin, '/kpi/monthly/document?month=2022-13')).status).toBe(400);
    expect((await call<unknown>(x.admin, '/kpi/monthly/document?month=2022-03&revision=1.5')).status).toBe(400);
    expect((await call<unknown>(x.admin, '/kpi/monthly/document?month=2022-03&revision=999')).status).toBe(404);
    const empty = await call<KpiDocument>(x.admin, '/kpi/monthly/document?month=2200-01');
    expect(empty.status).toBe(200); expect(empty.body.rows).toEqual([]); expect(empty.body.summary.totalWorkedMinutes).toBe(0);
  });
});
