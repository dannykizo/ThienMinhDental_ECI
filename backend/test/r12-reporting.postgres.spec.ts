import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReportingService } from '../src/modules/reporting/reporting.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { EmployeeAdminService } from '../src/modules/employees/employee-admin.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';

const label = 'R12 development-only acceptance';
interface Fixture { employeeId: string; code: string; date: string; month: string; departmentId: string }
describe.skipIf(process.env.R12_POSTGRES_TEST !== '1')('R12 monthly snapshot/Excel — disposable PostgreSQL', () => {
  const name = `r12_reporting_test_${randomUUID().replaceAll('-', '')}`;
  let db: DataSource, maintenance: DataSource, created = false, service: ReportingService, admin: AuthenticatedUserView, accountant: AuthenticatedUserView, index = 0;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('R12 requires local development PostgreSQL');
    url.hostname = '127.0.0.1';
    maintenance = new DataSource({ type: 'postgres', url: url.toString(), connectTimeoutMS: 5000 });
    await maintenance.initialize(); await maintenance.query(`CREATE DATABASE "${name}"`); created = true;
    const { applicationDataSource } = await import('../src/database/data-source.js');
    if (applicationDataSource.options.type !== 'postgres') throw new Error('PostgreSQL required');
    url.pathname = `/${name}`;
    db = new DataSource({ ...applicationDataSource.options, url: url.toString(), connectTimeoutMS: 5000 });
    await db.initialize(); await db.runMigrations(); service = new ReportingService(db);
    const [user] = await db.query<Array<{ id: string }>>(`INSERT INTO users(email,password_hash) VALUES($1,'NOT_A_LOGIN_CREDENTIAL') RETURNING id`, [`r12-${randomUUID()}@development.invalid`]);
    admin = { id: user.id, employeeId: null, email: 'dev@development.invalid', displayName: label, roles: [RoleCode.Admin] };
    accountant = { ...admin, roles: [RoleCode.ChiefAccountant] };
  }, 30_000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (created && maintenance?.isInitialized && /^r12_reporting_test_[a-f0-9]{32}$/.test(name)) await maintenance.query(`DROP DATABASE "${name}"`);
    if (maintenance?.isInitialized) await maintenance.destroy();
  }, 10_000);
  async function fixture(): Promise<Fixture> {
    const date = new Date(Date.UTC(2022, index++, 15)).toISOString().slice(0, 10), code = randomUUID().slice(0, 28);
    const [department] = await db.query<Array<{ id: string }>>('INSERT INTO departments(code,name) VALUES($1,$2) RETURNING id', [code, label]);
    const [employee] = await db.query<Array<{ id: string }>>('INSERT INTO employees(employee_code,full_name,department_id) VALUES($1,$2,$3) RETURNING id', [code, label, department.id]);
    const [schedule] = await db.query<Array<{ id: string }>>(`INSERT INTO work_schedules(name,start_time,end_time,weekdays,required_work_minutes) VALUES($1,'08:00','17:00','{1,2,3,4,5,6,7}',480) RETURNING id`, [label]);
    await db.query('INSERT INTO employee_schedules(employee_id,schedule_id,effective_from,effective_to) VALUES($1,$2,$3,$3)', [employee.id, schedule.id, date]);
    await db.query(`INSERT INTO attendance_events(employee_id,event_type,attendance_type,server_time,risk_flags) VALUES($1,'CHECK_IN','BUSINESS_TRIP',$2,'{LATE}'),($1,'CHECK_OUT','BUSINESS_TRIP',$3,'{}')`, [employee.id, `${date}T08:00:00+07:00`, `${date}T16:01:00+07:00`]);
    return { employeeId: employee.id, code, date, month: date.slice(0, 7), departmentId: department.id };
  }
  async function ot(x: Fixture, status = 'APPROVED'): Promise<void> {
    await db.query(`INSERT INTO overtime_requests(employee_id,submitted_by,submission_id,work_date,requested_minutes,reason,work_content,status) VALUES($1,$2,$3,$4,61,$5,$5,$6)`, [x.employeeId, admin.id, randomUUID(), x.date, label, status]);
  }
  async function leave(x: Fixture, duration = 'HALF_DAY', status = 'APPROVED'): Promise<void> {
    await db.query(`INSERT INTO leave_requests(employee_id,leave_type,policy_id,start_date,end_date,reason,status,duration_type,requested_minutes)
      SELECT $1,'ANNUAL',id,$2,$2,$3,$4,$5,240 FROM leave_policies WHERE code='ANNUAL'`, [x.employeeId, x.date, label, status, duration]);
  }
  async function waitForCloseLock(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const [row] = await db.query<Array<{ waiting: boolean }>>(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='attendance_events'::regclass AND mode='ShareLock' AND NOT granted) AS waiting`);
      if (row.waiting) return;
      await delay(20);
    }
    throw new Error('Close never waited on the real projection writer');
  }
  it('locks once, preserves exact filtered rows/totals and serializes simultaneous close', async () => {
    const x = await fixture(); await ot(x); await leave(x);
    const before = await service.document(x.month, x.employeeId);
    expect(before.summary).toMatchObject({ totalWorkedMinutes: 481, totalOvertimeMinutes: 61, leaveDays: 0, partialLeaveDays: 1, officeDays: 0, fieldDays: 1 });
    const result = await Promise.allSettled([service.lockPeriod(admin, x.month, label), service.lockPeriod(admin, x.month, label)]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const report = await service.document(x.month, x.employeeId, x.departmentId);
    expect(report.source).toBe('SNAPSHOT'); expect(report.revision).toBe(1); expect(report.rows).toEqual(before.rows);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await service.exportMonthly(x.month, x.employeeId) as never);
    expect(book.getWorksheet('Tổng hợp nhân viên')!.getCell('L2').value).toBe(report.summary.totalWorkedMinutes);
    expect(book.getWorksheet('Tổng hợp nhân viên')!.getCell('N2').value).toBe(report.summary.totalOvertimeMinutes);
    expect((await service.monthly(x.month, undefined, undefined, [])).length).toBe(0);
  });
  it('survives actual R3 permanent deletion; reopen/reclose appends without rewriting version one', async () => {
    const x = await fixture(); await service.lockPeriod(admin, x.month, label);
    const saved = await service.document(x.month);
    const deletion = new EmployeeAdminService(db, {} as never, { drain: vi.fn().mockResolvedValue(0) } as never);
    const impact = await deletion.deletionImpact(admin, x.employeeId) as { confirmationToken: string };
    await deletion.delete(admin, x.employeeId, { employeeCode: x.code, reason: label, confirmationToken: impact.confirmationToken });
    expect((await service.document(x.month)).rows).toEqual(saved.rows);
    await service.reopenPeriod(accountant, x.month, label);
    expect((await service.document(x.month)).source).toBe('LIVE'); expect((await service.document(x.month, undefined, undefined, '1')).rows).toEqual(saved.rows);
    // A new synthetic employee supplies the next revision after the original is deleted.
    await db.query(`INSERT INTO employees(employee_code,full_name) VALUES($1,$2)`, [randomUUID().slice(0, 28), label]);
    const y = await fixture(); await db.query('UPDATE employee_schedules SET effective_from=$2,effective_to=$2 WHERE employee_id=$1', [y.employeeId, x.date]);
    await service.lockPeriod(admin, x.month, label);
    expect((await service.document(x.month)).revision).toBe(2);
    expect((await service.document(x.month, undefined, undefined, '1')).rows).toEqual(saved.rows);
    await expect(db.query('UPDATE attendance_report_snapshots SET lock_reason=$1', [label])).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(db.query('DELETE FROM attendance_report_snapshots')).rejects.toMatchObject({ driverError: { code: '23514' } });
  });
  it('exports pending data with notes, but keeps company-wide closing strict even with an unrelated filter', async () => {
    const x = await fixture(); await ot(x, 'SUBMITTED');
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await service.exportMonthly(x.month, randomUUID()) as never);
    expect(book.getWorksheet('Thông tin kỳ')!.getRows(1, 30)!.some(r => typeof r.getCell(2).value === 'string' && (r.getCell(2).value as string).includes('1 phiếu OT chờ'))).toBe(true);
    const report = await service.document(x.month, x.employeeId);
    expect(report.issues).toHaveLength(1); expect(report.issues![0].note).toContain('OT:');
    await expect(service.lockPeriod(admin, x.month, label)).rejects.toMatchObject({ response: { code: 'ATTENDANCE_PERIOD_HAS_BLOCKERS' } });
    expect((await service.getPeriod(x.month)).status).toBe('OPEN');
  });
  it('waits for a real attendance update, then snapshots its committed duration', async () => {
    const x = await fixture(), writer = db.createQueryRunner(); await writer.connect(); await writer.startTransaction();
    let close: Promise<unknown> | undefined;
    try {
      await writer.query(`UPDATE attendance_events SET server_time=$2 WHERE employee_id=$1 AND event_type='CHECK_OUT'`, [x.employeeId, `${x.date}T17:01:00+07:00`]);
      close = service.lockPeriod(admin, x.month, label); void close.catch(() => undefined);
      await waitForCloseLock(); await writer.commitTransaction(); await close;
      expect((await service.document(x.month)).summary.totalWorkedMinutes).toBe(541);
    } finally { if (writer.isTransactionActive) await writer.rollbackTransaction(); await writer.release(); if (close) await close.catch(() => undefined); }
  });
  it('rechecks incomplete checkout after a concurrent writer; approved leave cannot hide it', async () => {
    const x = await fixture(); await leave(x, 'FULL_DAY');
    const writer = db.createQueryRunner(); await writer.connect(); await writer.startTransaction();
    let close: Promise<unknown> | undefined;
    try {
      await writer.query(`DELETE FROM attendance_events WHERE employee_id=$1 AND event_type='CHECK_OUT'`, [x.employeeId]);
      close = service.lockPeriod(admin, x.month, label); void close.catch(() => undefined);
      await waitForCloseLock(); await writer.commitTransaction();
      await expect(close).rejects.toMatchObject({ response: { code: 'ATTENDANCE_PERIOD_HAS_BLOCKERS' } });
      expect((await service.getPeriod(x.month)).status).toBe('OPEN');
    } finally { if (writer.isTransactionActive) await writer.rollbackTransaction(); await writer.release(); if (close) await close.catch(() => undefined); }
  });
  it('keeps existing recorded attendance when a profile is deactivated before close', async () => {
    const x = await fixture(); await db.query('UPDATE employees SET is_active=false,employment_end_date=$2,employment_status_reason=$3,status_changed_at=now(),status_changed_by=$4 WHERE id=$1', [x.employeeId, x.date, label, admin.id]);
    expect((await service.document(x.month)).summary.totalWorkedMinutes).toBe(481);
  });
  it('rolls back the period and snapshot together when audit fails', async () => {
    const x = await fixture();
    await db.query(`CREATE FUNCTION r12_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.resource_type='ATTENDANCE_PERIOD' AND NEW.new_value->>'month'='${x.month}' THEN RAISE EXCEPTION 'R12 synthetic audit failure'; END IF;
      RETURN NEW; END $$; CREATE TRIGGER r12_fail_audit BEFORE INSERT ON configuration_audit_logs FOR EACH ROW EXECUTE FUNCTION r12_fail_audit()`);
    try {
      await expect(service.lockPeriod(admin, x.month, label)).rejects.toThrow('R12 synthetic audit failure');
      expect((await service.getPeriod(x.month)).status).toBe('OPEN');
      expect((await service.document(x.month)).versions).toHaveLength(0);
    } finally { await db.query('DROP TRIGGER r12_fail_audit ON configuration_audit_logs; DROP FUNCTION r12_fail_audit()'); }
  });
  it('does not invent a snapshot for a legacy locked month', async () => {
    const x = await fixture(); await db.query(`INSERT INTO attendance_periods(period_month,status) VALUES($1,'LOCKED')`, [`${x.month}-01`]);
    const live = await service.document(x.month);
    expect(live.source).toBe('LIVE'); expect(live.warnings?.join(' ')).toContain('KHÔNG phải bản lịch sử');
    expect((await service.supportingDocument(x.month)).warnings.join(' ')).toContain('KHÔNG phải dữ liệu lịch sử');
    await expect(service.exportMonthly(x.month)).resolves.toBeInstanceOf(Buffer);
    await service.reopenPeriod(accountant, x.month, label); await service.lockPeriod(admin, x.month, label);
    expect((await service.document(x.month)).revision).toBe(1);
  });
  it('rejects attendance in a locked current month before consuming device proof or saving an event', async () => {
    const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
    await db.query(`INSERT INTO attendance_periods(period_month,status) VALUES($1,'LOCKED')`, [`${month}-01`]);
    const proof = { session: vi.fn(), consume: vi.fn() };
    const attendance = new AttendanceService(db, {} as never, {} as never, {} as never, {} as never, {} as never, proof as never);
    await expect(attendance.record({ ...admin, employeeId: randomUUID() }, { attendanceType: 'OFFICE', eventType: 'CHECK_OUT', latitude: 10, longitude: 106 } as never, randomUUID()))
      .rejects.toMatchObject({ response: { code: 'ATTENDANCE_PERIOD_LOCKED' } });
    expect(proof.consume).not.toHaveBeenCalled(); expect(proof.session).not.toHaveBeenCalled();
  });
  it('captures supporting detail on close; employee deletion cannot rewrite leave/OT/explanation history', async () => {
    const x = await fixture(); await ot(x); await leave(x);
    await service.lockPeriod(admin, x.month, label);
    const saved = await service.supportingDocument(x.month, x.employeeId);
    expect(saved.source).toBe('SNAPSHOT'); expect(saved.data.leave).toHaveLength(1); expect(saved.data.overtime).toHaveLength(1);
    const deletion = new EmployeeAdminService(db, {} as never, { drain: vi.fn().mockResolvedValue(0) } as never);
    const impact = await deletion.deletionImpact(admin, x.employeeId) as { confirmationToken: string };
    await deletion.delete(admin, x.employeeId, { employeeCode: x.code, reason: label, confirmationToken: impact.confirmationToken });
    expect((await service.supportingDocument(x.month, x.employeeId)).data).toEqual(saved.data);
    await service.reopenPeriod(accountant, x.month, label);
    expect((await service.supportingDocument(x.month, x.employeeId, undefined, '1')).data).toEqual(saved.data);
  });
  it('labels old monthly-only revisions honestly instead of blocking supporting exports', async () => {
    const x = await fixture();
    const [p] = await db.query<Array<{ id: string }>>(`INSERT INTO attendance_periods(period_month,status) VALUES($1,'LOCKED') RETURNING id`, [`${x.month}-01`]);
    await db.query(`INSERT INTO attendance_report_snapshots(period_id,revision,rows,summary,locked_by,locked_by_name)
      VALUES($1,1,'[]',$2::jsonb,$3,$4)`, [p.id, JSON.stringify({ incompleteBlockerCount: 0, openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 }), admin.id, label]);
    const report = await service.supportingDocument(x.month, x.employeeId);
    expect(report.source).toBe('LIVE'); expect(report.revision).toBeNull(); expect(report.warnings.join(' ')).toContain('chưa lưu chi tiết');
    for (const kind of ['leave', 'overtime', 'explanations'] as const) await expect(service.exportSupporting(kind, x.month, x.employeeId)).resolves.toBeInstanceOf(Buffer);
  });
  it('seeds isolated Excel acceptance: incomplete, pending, rejected, cancelled, cross-month, quota and immutable adjustments', async () => {
    const x = await fixture(); await ot(x, 'SUBMITTED'); await leave(x);
    await db.query(`UPDATE leave_policies SET balance_tracking_enabled=true,annual_entitlement_minutes=5760 WHERE code='ANNUAL'`);
    await db.query(`DELETE FROM attendance_events WHERE employee_id=$1 AND event_type='CHECK_OUT'`, [x.employeeId]);
    await db.query(`INSERT INTO leave_requests(employee_id,leave_type,policy_id,start_date,end_date,reason,status,duration_type,requested_minutes,start_time,end_time)
      SELECT $1,'ANNUAL',id,$2,$2,$3,'SUBMITTED','HOURS',61,'08:00','09:01' FROM leave_policies WHERE code='ANNUAL'`, [x.employeeId, x.date.slice(0, 8) + '16', label]);
    await db.query(`INSERT INTO leave_requests(employee_id,leave_type,policy_id,start_date,end_date,reason,status,duration_type,requested_minutes)
      SELECT $1,'ANNUAL',id,$2,($2::date+INTERVAL '1 month')::date,$3,'CANCELLED','FULL_DAY',960 FROM leave_policies WHERE code='ANNUAL'`, [x.employeeId, x.date, label]);
    const [request] = await db.query<Array<{ id: string }>>(`INSERT INTO attendance_explanation_requests(employee_id,work_date,issue_type,request_note,requested_by,status)
      VALUES($1,$2,'MISSING_CHECK_OUT',$3,$4,'REQUESTED') RETURNING id`, [x.employeeId, x.date, label, admin.id]);
    await db.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,new_value,created_by) VALUES('ATTENDANCE_EXPLANATION',$1,'REQUEST','{}',$2)`, [request.id, admin.id]);
    await db.query(`INSERT INTO attendance_adjustments(employee_id,work_date,field_name,old_value,new_value,reason,adjusted_by)
      VALUES($1,$2,'CHECK_IN_TIME',$3::jsonb,$4::jsonb,$5,$6)`, [x.employeeId, x.date, JSON.stringify(`${x.date}T08:00:00+07:00`), JSON.stringify(`${x.date}T08:01:00+07:00`), label, admin.id]);
    const report = await service.supportingDocument(x.month, x.employeeId, x.departmentId);
    expect(report.data.leave).toHaveLength(3); expect(report.data.overtime).toHaveLength(1); expect(report.data.adjustments).toHaveLength(1); expect(report.data.audit).toHaveLength(1);
    expect(report.data.balances[0]).toMatchObject({ approvedMinutes: 240, pendingMinutes: 61, initialized: false });
    const [balance] = await db.query<Array<{ id: string }>>(`INSERT INTO employee_leave_balances(employee_id,policy_id,balance_year,entitlement_minutes,carry_over_minutes)
      SELECT $1,id,EXTRACT(YEAR FROM $2::date)::int,5760,240 FROM leave_policies WHERE code='ANNUAL' RETURNING id`, [x.employeeId, x.date]);
    await db.query(`INSERT INTO leave_balance_adjustments(balance_id,delta_minutes,reason,created_by) VALUES($1,61,$2,$3)`, [balance.id, label, admin.id]);
    const initialized = await service.supportingDocument(x.month, x.employeeId);
    expect(initialized.data.balances[0]).toMatchObject({ initialized: true, availableMinutes: 5760, adjustmentMinutes: 61 });
    expect(initialized.data.balanceAdjustments).toHaveLength(1);
    await expect(service.lockPeriod(admin, x.month, label)).rejects.toMatchObject({ response: { code: 'ATTENDANCE_PERIOD_HAS_BLOCKERS' } });
    for (const kind of ['monthly', 'leave', 'overtime', 'explanations'] as const) {
      const buffer = kind === 'monthly' ? await service.exportMonthly(x.month, x.employeeId) : await service.exportSupporting(kind, x.month, x.employeeId);
      const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as never);
      expect(book.getWorksheet('Thông tin kỳ')).toBeDefined();
      if (kind === 'monthly') { const detail = book.getWorksheet('Chi tiết ngày')!; expect(detail.getCell('O2').value).toContain('Thiếu check-out'); expect(detail.getCell('O2').fill).toMatchObject({ fgColor: { argb: 'FFFEE2E2' } }); }
      if (kind === 'overtime') { expect(book.getWorksheet('Chi tiết OT')!.getCell('H2').value).toBe(0); expect(book.getWorksheet('Tổng hợp nhân viên')!.getCell('I2').value).toBe(0); }
      for (const sheet of book.worksheets) sheet.eachRow(row => row.eachCell(cell => { expect(cell.type).not.toBe(ExcelJS.ValueType.Formula); }));
      if (process.env.R12_REPORT_OUTPUT_DIR) {
        const base = resolve(process.cwd(), '../logs'), target = resolve(process.env.R12_REPORT_OUTPUT_DIR), part = relative(base, target);
        if (part.startsWith('..') || isAbsolute(part)) throw new Error('Sample reports must stay within ignored workspace logs');
        await mkdir(target, { recursive: true }); await writeFile(resolve(target, `DEVELOPMENT-ONLY-${kind}.xlsx`), buffer);
      }
    }
  });
});
