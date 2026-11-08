import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { calculateWorkSummary } from '../attendance/domain/schedule-policy.js';
import { summarizeEmployees, summarizeMonthly, type EmployeeMonthlySummary, type MonthlyRow, type MonthlySummary, type PeriodBlockers } from './domain/monthly-report.js';
import { buildMonthlyWorkbook } from './monthly-workbook.js';
import { filterSupporting, readPendingIssues, readSupportingReports, type ReportIssue, type ReportKind, type SupportingReports } from './supporting-report-data.js';
import { buildSupportingWorkbook } from './supporting-workbook.js';
export type { MonthlyRow, MonthlySummary } from './domain/monthly-report.js';

interface MonthlyRawRow extends Omit<MonthlyRow, 'workedMinutes' | 'requiredWorkMinutes' | 'overtimeMinutes' | 'isFullWorkday'> {
  approvedOvertimeMinutes: number;
  scheduleStartTime: string;
  scheduleEndTime: string;
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  scheduleRequiredWorkMinutes: number;
}

export interface AttendancePeriodView {
  id: string | null;
  periodMonth: string;
  status: 'OPEN' | 'LOCKED';
  lockedAt: string | null;
  lockedByName: string | null;
  reopenedAt: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
  revision: number;
}

export interface ReportVersion { revision: number; lockedAt: string; lockedByName: string; lockReason: string | null }
export interface MonthlyDocument {
  month: string;
  rows: MonthlyRow[];
  summary: MonthlySummary;
  period: AttendancePeriodView;
  versions: ReportVersion[];
  source: 'LIVE' | 'SNAPSHOT';
  revision: number | null;
  lockedAt: string | null;
  lockedByName: string | null;
  issues?: ReportIssue[];
  warnings?: string[];
}
type Reader = Pick<EntityManager, 'query'>;
interface Snapshot extends ReportVersion { rows: MonthlyRow[]; summary: MonthlySummary; supportingReports: SupportingReports | null }
export interface SupportingDocument {
  month: string; data: SupportingReports; source: 'LIVE' | 'SNAPSHOT'; revision: number | null;
  lockedAt: string | null; lockedByName: string | null; warnings: string[];
}
export interface DashboardSummary {
  activeEmployees: number; attendanceToday: number; reviewRequired: number; incompleteToday: number;
  activeTrips: number; pendingLeave: number; openExplanations: number; pendingOvertime: number; publishedAnnouncements: number;
  workDate: string; asOf: string; scopeLabel: string; attendanceSource: 'LIVE' | 'SNAPSHOT'; attendanceRevision: number | null; warnings: string[];
}
export interface KpiDocument extends Omit<MonthlyDocument, 'rows' | 'issues'> { rows: EmployeeMonthlySummary[] }

@Injectable()
export class ReportingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async dashboard(user: AuthenticatedUserView): Promise<DashboardSummary> {
    if (!user.roles.some(role => [RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager].includes(role))) throw new ForbiddenException();
    const globalAccess = user.roles.some((role) =>
      [RoleCode.Admin, RoleCode.ChiefAccountant].includes(role),
    );
    return this.dataSource.transaction('REPEATABLE READ', async manager => {
      const [clock] = await manager.query<Array<{ workDate: string; asOf: string }>>(`SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS "workDate",now()::text AS "asOf"`);
      const ids = globalAccess ? undefined : (await manager.query<Array<{ id: string }>>(`SELECT DISTINCT a.employee_id AS id
        FROM user_branch_scopes s JOIN employee_organization_assignments a ON a.branch_id=s.branch_id
        JOIN branches b ON b.id=a.branch_id JOIN departments d ON d.id=a.department_id
        WHERE s.user_id=$1 AND b.is_active AND d.is_active AND a.effective_from<=$2::date
          AND (a.effective_to IS NULL OR a.effective_to>=$2::date)`, [user.id, clock.workDate])).map(row => row.id);
      const report = await this.document(clock.workDate.slice(0, 7), undefined, undefined, undefined, ids, manager);
      const today = report.rows.filter(row => row.workDate === clock.workDate);
      const daily = summarizeMonthly(today, { openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 }, today.filter(row => row.status === 'INCOMPLETE').length);
      const [counts] = await manager.query<Array<{ activeEmployees: number; activeTrips: number; pendingLeave: number; openExplanations: number; pendingOvertime: number; publishedAnnouncements: number }>>(`SELECT
        (SELECT count(*)::int FROM employees WHERE is_active AND ($1::uuid[] IS NULL OR id=ANY($1::uuid[]))) AS "activeEmployees",
        (SELECT count(*)::int FROM business_trips bt WHERE bt.status IN ('ASSIGNED','IN_PROGRESS') AND ($2::boolean OR EXISTS(SELECT 1 FROM business_trip_members m WHERE m.business_trip_id=bt.id AND m.employee_id=ANY($1::uuid[])))) AS "activeTrips",
        (SELECT count(*)::int FROM leave_requests WHERE status='SUBMITTED' AND ($1::uuid[] IS NULL OR employee_id=ANY($1::uuid[]))) AS "pendingLeave",
        (SELECT count(*)::int FROM attendance_explanation_requests WHERE status IN ('REQUESTED','SUBMITTED') AND ($1::uuid[] IS NULL OR employee_id=ANY($1::uuid[]))) AS "openExplanations",
        (SELECT count(*)::int FROM overtime_requests WHERE status='SUBMITTED' AND ($1::uuid[] IS NULL OR employee_id=ANY($1::uuid[]))) AS "pendingOvertime",
        (SELECT count(*)::int FROM announcements a WHERE a.status='PUBLISHED' AND ($2::boolean OR (
          EXISTS(SELECT 1 FROM announcement_recipients r WHERE r.announcement_id=a.id AND r.employee_id=ANY($1::uuid[]))
          AND NOT EXISTS(SELECT 1 FROM employee_disciplinary_actions da WHERE da.announcement_id=a.id OR da.revocation_announcement_id=a.id)))) AS "publishedAnnouncements"`, [ids ?? null, globalAccess]);
      return { ...counts, attendanceToday: today.filter(row => Boolean(row.checkedInAt || row.checkedOutAt)).length,
        reviewRequired: daily.reviewDays, incompleteToday: daily.incompleteDays, workDate: clock.workDate, asOf: clock.asOf,
        scopeLabel: globalAccess ? 'Toàn bộ chi nhánh' : 'Chi nhánh được phân quyền', attendanceSource: report.source, attendanceRevision: report.revision, warnings: report.warnings ?? [] };
    });
  }

  async monthly(month: string, employeeId?: string, departmentId?: string, allowedEmployeeIds?: string[]): Promise<MonthlyRow[]> {
    return (await this.document(month, employeeId, departmentId, undefined, allowedEmployeeIds)).rows;
  }

  private async liveMonthly(month: string, reader: Reader): Promise<MonthlyRow[]> {
    this.validateMonth(month);
    const rows = await reader.query<MonthlyRawRow[]>(`WITH bounds AS (
      SELECT $1::date AS month_start, LEAST(($1::date + INTERVAL '1 month - 1 day')::date, (now() AT TIME ZONE 'Asia/Bangkok')::date) AS month_end
    ), scheduled AS (
      SELECT e.id employee_id, e.employee_code, e.full_name, e.department_id, d.name department_name, day::date work_date,
        selected_schedule.start_time, selected_schedule.end_time, selected_schedule.late_tolerance_minutes,
        selected_schedule.early_leave_tolerance_minutes, selected_schedule.required_work_minutes
      FROM employees e
      LEFT JOIN departments d ON d.id=e.department_id
      CROSS JOIN bounds b CROSS JOIN LATERAL generate_series(b.month_start,b.month_end,'1 day') day
      LEFT JOIN LATERAL (
        SELECT ws.id,ws.start_time,ws.end_time,ws.weekdays,ws.late_tolerance_minutes,ws.early_leave_tolerance_minutes,ws.required_work_minutes
        FROM (
          SELECT es.schedule_id, es.effective_from, 1 AS priority
          FROM employee_schedules es
          WHERE es.employee_id=e.id AND es.effective_from<=day::date
            AND (es.effective_to IS NULL OR es.effective_to>=day::date)
          UNION ALL
          SELECT ds.schedule_id, ds.effective_from, 2 AS priority
          FROM (
            SELECT branch_id,department_id FROM employee_organization_assignments
            WHERE employee_id=e.id AND effective_from<=day::date
              AND (effective_to IS NULL OR effective_to>=day::date)
            ORDER BY is_primary DESC,effective_from DESC LIMIT 1
          ) oa
          JOIN department_schedules ds ON ds.branch_id=oa.branch_id AND ds.department_id=oa.department_id
          WHERE ds.effective_from<=day::date AND (ds.effective_to IS NULL OR ds.effective_to>=day::date)
        ) candidate
        JOIN work_schedules ws ON ws.id=candidate.schedule_id
        WHERE ws.is_active=true
        ORDER BY candidate.priority, candidate.effective_from DESC,ws.id LIMIT 1
      ) selected_schedule ON extract(isodow from day)::int=ANY(selected_schedule.weekdays)
      WHERE (e.is_active=true
        OR EXISTS(SELECT 1 FROM attendance_events ae WHERE ae.employee_id=e.id AND (ae.server_time AT TIME ZONE 'Asia/Bangkok')::date=day::date)
        OR EXISTS(SELECT 1 FROM leave_requests l WHERE l.employee_id=e.id AND l.status='APPROVED' AND day::date BETWEEN l.start_date AND l.end_date)
        OR EXISTS(SELECT 1 FROM overtime_requests ot WHERE ot.employee_id=e.id AND ot.work_date=day::date AND ot.status='APPROVED'))
        AND (selected_schedule.id IS NOT NULL OR EXISTS(SELECT 1 FROM attendance_events ae WHERE ae.employee_id=e.id AND (ae.server_time AT TIME ZONE 'Asia/Bangkok')::date=day::date) OR EXISTS(SELECT 1 FROM overtime_requests ot WHERE ot.employee_id=e.id AND ot.work_date=day::date AND ot.status='APPROVED'))
    ), event_rollup AS (
      SELECT employee_id,(server_time AT TIME ZONE 'Asia/Bangkok')::date work_date,
        MIN(server_time) FILTER (WHERE event_type='CHECK_IN') checked_in_at,
        MAX(server_time) FILTER (WHERE event_type='CHECK_OUT') checked_out_at,
        (array_agg(attendance_type ORDER BY server_time) FILTER (WHERE event_type='CHECK_IN'))[1] attendance_type,
        COALESCE(array_remove(array_agg(DISTINCT flag),NULL),'{}') risk_flags
      FROM attendance_events LEFT JOIN LATERAL unnest(risk_flags) flag ON true
      WHERE (server_time AT TIME ZONE 'Asia/Bangkok')::date >= (SELECT month_start FROM bounds) AND (server_time AT TIME ZONE 'Asia/Bangkok')::date <= (SELECT month_end FROM bounds)
      GROUP BY employee_id,(server_time AT TIME ZONE 'Asia/Bangkok')::date
    ) SELECT s.employee_id AS "employeeId",s.employee_code AS "employeeCode",s.full_name AS "fullName",s.department_id AS "departmentId",s.department_name AS "departmentName",s.work_date::text AS "workDate",er.attendance_type AS "attendanceType",
      COALESCE((SELECT aa.new_value#>>'{}' FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date AND aa.field_name='CHECK_IN_TIME' ORDER BY aa.created_at DESC LIMIT 1),er.checked_in_at::text) AS "checkedInAt",
      COALESCE((SELECT aa.new_value#>>'{}' FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date AND aa.field_name='CHECK_OUT_TIME' ORDER BY aa.created_at DESC LIMIT 1),er.checked_out_at::text) AS "checkedOutAt",
      COALESCE((SELECT aa.new_value#>>'{}' FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date AND aa.field_name='DAY_STATUS' ORDER BY aa.created_at DESC LIMIT 1),
        CASE WHEN er.checked_in_at IS NOT NULL AND er.checked_out_at IS NULL THEN 'INCOMPLETE'
        WHEN EXISTS(SELECT 1 FROM leave_requests l WHERE l.employee_id=s.employee_id AND l.status='APPROVED' AND l.duration_type='FULL_DAY' AND s.work_date BETWEEN l.start_date AND l.end_date) THEN 'LEAVE'
        WHEN EXISTS(SELECT 1 FROM leave_requests l WHERE l.employee_id=s.employee_id AND l.status='APPROVED' AND l.duration_type IN ('HALF_DAY','HOURS') AND s.work_date=l.start_date) THEN 'PARTIAL_LEAVE'
        WHEN er.attendance_type='BUSINESS_TRIP' AND er.checked_out_at IS NOT NULL THEN 'BUSINESS_TRIP'
        WHEN er.checked_out_at IS NOT NULL THEN 'PRESENT' WHEN er.checked_in_at IS NOT NULL THEN 'INCOMPLETE' ELSE 'ABSENT' END) AS status,
      COALESCE(er.risk_flags,'{}') AS "riskFlags",(SELECT COUNT(*)::int FROM attendance_adjustments aa WHERE aa.employee_id=s.employee_id AND aa.work_date=s.work_date) AS "adjustmentCount",
      s.start_time AS "scheduleStartTime",s.end_time AS "scheduleEndTime",s.late_tolerance_minutes AS "lateToleranceMinutes",
      s.early_leave_tolerance_minutes AS "earlyLeaveToleranceMinutes",s.required_work_minutes AS "scheduleRequiredWorkMinutes",
      COALESCE((SELECT SUM(ot.requested_minutes)::int FROM overtime_requests ot WHERE ot.employee_id=s.employee_id AND ot.work_date=s.work_date AND ot.status='APPROVED'),0) AS "approvedOvertimeMinutes"
      FROM scheduled s LEFT JOIN event_rollup er ON er.employee_id=s.employee_id AND er.work_date=s.work_date ORDER BY s.work_date,s.full_name`, [`${month}-01`]);
    return rows.map(({ scheduleStartTime, scheduleEndTime, lateToleranceMinutes, earlyLeaveToleranceMinutes, scheduleRequiredWorkMinutes, approvedOvertimeMinutes, ...row }) => ({
      ...row,
      ...calculateWorkSummary(row.checkedInAt, row.checkedOutAt, scheduleRequiredWorkMinutes == null ? null : {
        startTime: scheduleStartTime,
        endTime: scheduleEndTime,
        lateToleranceMinutes,
        earlyLeaveToleranceMinutes,
        requiredWorkMinutes: scheduleRequiredWorkMinutes,
      }),
      overtimeMinutes: approvedOvertimeMinutes ?? 0,
    }));
  }

  async monthlySummary(month: string, employeeId?: string, departmentId?: string): Promise<MonthlySummary> {
    return (await this.document(month, employeeId, departmentId)).summary;
  }

  async document(month: string, employeeId?: string, departmentId?: string, revision?: string, allowedEmployeeIds?: string[], reader?: Reader): Promise<MonthlyDocument> {
    this.validateReportQuery(month, employeeId, departmentId, revision);
    // One MVCC view for period, rows, blockers and metadata; no writes from GET.
    const read = async (manager: Reader): Promise<MonthlyDocument> => {
      const period = await this.getPeriod(month, manager);
      const versions = await manager.query<ReportVersion[]>(`SELECT s.revision,s.locked_at AS "lockedAt",s.locked_by_name AS "lockedByName",s.lock_reason AS "lockReason"
        FROM attendance_report_snapshots s JOIN attendance_periods p ON p.id=s.period_id
        WHERE p.period_month=$1::date ORDER BY s.revision DESC`, [`${month}-01`]);
      const selectedRevision = revision ? Number(revision) : period.status === 'LOCKED' ? period.revision : null;
      let allRows: MonthlyRow[], blockers: PeriodBlockers, incomplete: number;
      let snapshot: Snapshot | undefined;
      const warnings: string[] = [];
      if (selectedRevision !== null) {
        [snapshot] = await manager.query<Snapshot[]>(`SELECT s.rows,s.summary,s.revision,s.locked_at AS "lockedAt",s.locked_by_name AS "lockedByName",s.lock_reason AS "lockReason"
          FROM attendance_report_snapshots s JOIN attendance_periods p ON p.id=s.period_id WHERE p.period_month=$1::date AND s.revision=$2`, [`${month}-01`, selectedRevision]);
        if (!snapshot) {
          if (revision) throw new NotFoundException({ code: 'REPORT_REVISION_NOT_FOUND', message: 'Không có phiên bản báo cáo này.' });
          warnings.push('Kỳ cũ đã khóa nhưng chưa lưu báo cáo: xuất dữ liệu hiện tại để đối soát, KHÔNG phải bản lịch sử đã chốt.');
        }
      }
      if (snapshot) {
        allRows = snapshot.rows; blockers = snapshot.summary; incomplete = snapshot.summary.incompleteBlockerCount;
      } else {
        allRows = await this.liveMonthly(month, manager);
        blockers = await this.periodBlockers(month, manager, allowedEmployeeIds);
        incomplete = allRows.filter(row => row.status === 'INCOMPLETE').length;
      }
      const allowed = allowedEmployeeIds ? new Set(allowedEmployeeIds) : null;
      const rows = allRows.filter(row => (!employeeId || row.employeeId === employeeId) && (!departmentId || row.departmentId === departmentId) && (!allowed || allowed.has(row.employeeId)));
      const issues = snapshot ? [] : (await readPendingIssues(manager, month)).filter(row => (!employeeId || row.employeeId === employeeId) && (!departmentId || row.departmentId === departmentId) && (!allowed || allowed.has(row.employeeId)));
      const scopedIncomplete = allowed ? rows.filter(row => row.status === 'INCOMPLETE').length : incomplete;
      return { month, rows, summary: summarizeMonthly(rows, blockers, scopedIncomplete), period, versions,
        issues, warnings,
        source: snapshot ? 'SNAPSHOT' : 'LIVE', revision: snapshot?.revision ?? null,
        lockedAt: snapshot?.lockedAt ?? null, lockedByName: snapshot?.lockedByName ?? null };
    };
    return reader ? read(reader) : this.dataSource.transaction('REPEATABLE READ', read);
  }

  async kpi(month: string): Promise<EmployeeMonthlySummary[]> {
    return (await this.kpiDocument(month)).rows;
  }

  async kpiDocument(month: string, revision?: string): Promise<KpiDocument> {
    const report = await this.document(month, undefined, undefined, revision);
    return { month: report.month, source: report.source, revision: report.revision, lockedAt: report.lockedAt, lockedByName: report.lockedByName,
      period: report.period, versions: report.versions, warnings: report.warnings, summary: report.summary, rows: summarizeEmployees(report.rows) };
  }

  async exportMonthly(month: string, employeeId?: string, departmentId?: string, revision?: string, exportedBy?: string): Promise<Buffer> {
    const report = await this.document(month, employeeId, departmentId, revision);
    return buildMonthlyWorkbook(report, exportedBy, { employeeId, departmentId });
  }

  async supportingDocument(month: string, employeeId?: string, departmentId?: string, revision?: string): Promise<SupportingDocument> {
    this.validateReportQuery(month, employeeId, departmentId, revision);
    return this.dataSource.transaction('REPEATABLE READ', async manager => {
      const period = await this.getPeriod(month, manager);
      const selected = revision ? Number(revision) : period.status === 'LOCKED' ? period.revision : null;
      let snapshot: Snapshot | undefined;
      if (selected !== null) {
        [snapshot] = await manager.query<Snapshot[]>(`SELECT s.supporting_reports AS "supportingReports",s.revision,s.locked_at AS "lockedAt",s.locked_by_name AS "lockedByName"
          FROM attendance_report_snapshots s JOIN attendance_periods p ON p.id=s.period_id WHERE p.period_month=$1::date AND s.revision=$2`, [`${month}-01`, selected]);
        if (!snapshot && revision) throw new NotFoundException({ code: 'REPORT_REVISION_NOT_FOUND', message: 'Không có phiên bản báo cáo này.' });
      }
      const frozen = snapshot?.supportingReports;
      const warnings = !frozen && selected !== null ? ['Bản chốt cũ chưa lưu chi tiết báo cáo này. File dùng dữ liệu hiện tại, KHÔNG phải dữ liệu lịch sử của phiên bản đã chốt.'] : [];
      return { month, data: filterSupporting(frozen ?? await readSupportingReports(manager, month), employeeId, departmentId),
        source: frozen ? 'SNAPSHOT' : 'LIVE', revision: frozen ? snapshot!.revision : null,
        lockedAt: frozen ? snapshot!.lockedAt : null, lockedByName: frozen ? snapshot!.lockedByName : null, warnings };
    });
  }

  async exportSupporting(kind: ReportKind, month: string, employeeId?: string, departmentId?: string, revision?: string, exportedBy?: string): Promise<Buffer> {
    return buildSupportingWorkbook(kind, await this.supportingDocument(month, employeeId, departmentId, revision), exportedBy, { employeeId, departmentId });
  }

  async getPeriod(month: string, reader: Reader = this.dataSource): Promise<AttendancePeriodView> {
    this.validateMonth(month);
    const [period] = await reader.query<AttendancePeriodView[]>(`SELECT p.id,p.period_month::text AS "periodMonth",p.status,p.locked_at AS "lockedAt",COALESCE((SELECT s.locked_by_name FROM attendance_report_snapshots s WHERE s.period_id=p.id ORDER BY s.revision DESC LIMIT 1),locker.full_name,lu.email) AS "lockedByName",p.reopened_at AS "reopenedAt",COALESCE(reopener.full_name,ru.email) AS "reopenedByName",p.reopen_reason AS "reopenReason",COALESCE((SELECT MAX(revision) FROM attendance_report_snapshots WHERE period_id=p.id),0)::int AS revision FROM attendance_periods p LEFT JOIN users lu ON lu.id=p.locked_by LEFT JOIN employees locker ON locker.user_id=lu.id LEFT JOIN users ru ON ru.id=p.reopened_by LEFT JOIN employees reopener ON reopener.user_id=ru.id WHERE p.period_month=$1::date`, [`${month}-01`]);
    return period ?? { id: null, periodMonth: `${month}-01`, status: 'OPEN', lockedAt: null, lockedByName: null, reopenedAt: null, reopenedByName: null, reopenReason: null, revision: 0 };
  }

  async lockPeriod(user: AuthenticatedUserView, month: string, reason?: string): Promise<AttendancePeriodView> {
    if (!user.roles.some(role => [RoleCode.Admin, RoleCode.ChiefAccountant].includes(role))) throw new ForbiddenException();
    this.validateMonth(month);
    this.validateReason(reason, false);
    try {
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL lock_timeout='5s'");
      // Protect every projection input during the short close transaction,
      // including catalogue edits and R3 deletion that do not use month locks.
      // Existing writers either finish first, wait, or roll back on lock conflict.
      await manager.query(`LOCK TABLE attendance_adjustments,attendance_events,attendance_explanation_requests,
        department_schedules,departments,employee_organization_assignments,employee_schedules,employees,
        employee_leave_balances,leave_balance_adjustments,leave_policies,leave_requests,
        organization_teams,overtime_requests,users,work_schedules IN SHARE MODE`);
      await manager.query(`INSERT INTO attendance_periods(period_month,status) VALUES($1::date,'OPEN') ON CONFLICT(period_month) DO NOTHING`, [`${month}-01`]);
      const [current] = await manager.query<Array<{ id: string; status: string }>>('SELECT id,status FROM attendance_periods WHERE period_month=$1::date FOR UPDATE', [`${month}-01`]);
      if (current?.status === 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_ALREADY_LOCKED', message: 'Kỳ công đã được chốt.' });
      const rows = await this.liveMonthly(month, manager);
      if (rows.length === 0) throw new ConflictException({ code: 'REPORT_HAS_NO_DATA', message: 'Chưa có dữ liệu lịch làm việc để chốt kỳ công.' });
      const blockers = await this.periodBlockers(month, manager);
      const summary = summarizeMonthly(rows, blockers, rows.filter(row => row.status === 'INCOMPLETE').length);
      if (summary.blockerCount > 0) throw new ConflictException({ code: 'ATTENDANCE_PERIOD_HAS_BLOCKERS', message: `Còn ${summary.incompleteBlockerCount} ngày thiếu check-out, ${summary.openExplanationCount} giải trình, ${summary.pendingLeaveCount} đơn nghỉ và ${summary.pendingOvertimeCount} phiếu OT chưa hoàn tất.` });
      const supporting = await readSupportingReports(manager, month);
      const [saved] = await manager.query<Array<{ id: string }>>(`INSERT INTO attendance_periods(period_month,status,locked_by,locked_at,reopened_by,reopened_at,reopen_reason) VALUES($1::date,'LOCKED',$2,now(),NULL,NULL,NULL) ON CONFLICT(period_month) DO UPDATE SET status='LOCKED',locked_by=$2,locked_at=now(),reopened_by=NULL,reopened_at=NULL,reopen_reason=NULL,updated_at=now() RETURNING id`, [`${month}-01`, user.id]);
      const [snapshot] = await manager.query<Array<{ revision: number }>>(`INSERT INTO attendance_report_snapshots(period_id,revision,rows,summary,locked_by,locked_by_name,lock_reason,supporting_reports)
        SELECT $1,COALESCE(MAX(revision),0)+1,$2::jsonb,$3::jsonb,$4,$5,$6,$7::jsonb FROM attendance_report_snapshots WHERE period_id=$1 RETURNING revision`,
        [saved.id, JSON.stringify(rows), JSON.stringify(summary), user.id, user.displayName || user.email, reason?.trim() || null, JSON.stringify(supporting)]);
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by) VALUES('ATTENDANCE_PERIOD',$1,'LOCK',$2::jsonb,$3::jsonb,$4)`, [saved.id, JSON.stringify({ status: current?.status ?? 'OPEN' }), JSON.stringify({ status: 'LOCKED', month, revision: snapshot.revision, reason: reason?.trim() || null }), user.id]);
    });
    } catch (error) {
      const code = (error as { driverError?: { code?: string }; code?: string }).driverError?.code ?? (error as { code?: string }).code;
      if (code === '55P03' || code === '40P01') throw new ConflictException({ code: 'REPORT_BUSY', message: 'Có thao tác khác đang ghi dữ liệu. Tải lại báo cáo trước khi chốt; không tự gửi lại.' });
      throw error;
    }
    return this.getPeriod(month);
  }

  async reopenPeriod(user: AuthenticatedUserView, month: string, reason: string): Promise<AttendancePeriodView> {
    if (!user.roles.includes(RoleCode.ChiefAccountant)) throw new ForbiddenException();
    this.validateMonth(month);
    this.validateReason(reason, true);
    await this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query<Array<{ id: string; status: string }>>('SELECT id,status FROM attendance_periods WHERE period_month=$1::date FOR UPDATE', [`${month}-01`]);
      if (!current || current.status !== 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_NOT_LOCKED', message: 'Kỳ công hiện không ở trạng thái đã chốt.' });
      await manager.query(`UPDATE attendance_periods SET status='OPEN',reopened_by=$2,reopened_at=now(),reopen_reason=$3,updated_at=now() WHERE id=$1`, [current.id, user.id, reason.trim()]);
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by) VALUES('ATTENDANCE_PERIOD',$1,'REOPEN',$2::jsonb,$3::jsonb,$4)`, [current.id, JSON.stringify({ status: 'LOCKED' }), JSON.stringify({ status: 'OPEN', month, reason: reason.trim() }), user.id]);
    });
    return this.getPeriod(month);
  }

  private validateMonth(month: string): void {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1) throw new BadRequestException({ code: 'INVALID_REPORT_MONTH', message: 'Tháng phải có định dạng YYYY-MM.' });
  }

  private validateReportQuery(month: string, employeeId?: string, departmentId?: string, revision?: string): void {
    this.validateMonth(month);
    for (const id of [employeeId, departmentId]) {
      if (id !== undefined && (typeof id !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))) throw new BadRequestException({ code: 'INVALID_REPORT_FILTER', message: 'Bộ lọc phải là UUID hợp lệ.' });
    }
    if (revision !== undefined && (typeof revision !== 'string' || !/^[1-9]\d{0,8}$/.test(revision))) throw new BadRequestException({ code: 'INVALID_REPORT_REVISION', message: 'Phiên bản phải là số nguyên dương.' });
  }

  private validateReason(reason: string | undefined, required: boolean): void {
    if ((required || reason !== undefined) && (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 2000)) {
      throw new BadRequestException({ code: 'INVALID_PERIOD_REASON', message: 'Lý do cần từ 5 đến 2000 ký tự, không chỉ khoảng trắng.' });
    }
  }

  private async periodBlockers(month: string, reader: Reader = this.dataSource, allowedEmployeeIds?: string[]): Promise<PeriodBlockers> {
    const params = [`${month}-01`, allowedEmployeeIds ?? null];
    const [openExplanations] = await reader.query<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM attendance_explanation_requests WHERE work_date >= $1::date AND work_date < ($1::date + INTERVAL '1 month') AND status IN ('REQUESTED','SUBMITTED') AND ($2::uuid[] IS NULL OR employee_id=ANY($2::uuid[]))`, params);
    const [pendingLeave] = await reader.query<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM leave_requests WHERE status='SUBMITTED' AND start_date < ($1::date + INTERVAL '1 month') AND end_date >= $1::date AND ($2::uuid[] IS NULL OR employee_id=ANY($2::uuid[]))`, params);
    const [pendingOvertime] = await reader.query<Array<{ count: number }>>(`SELECT COUNT(*)::int AS count FROM overtime_requests WHERE status='SUBMITTED' AND work_date >= $1::date AND work_date < ($1::date + INTERVAL '1 month') AND ($2::uuid[] IS NULL OR employee_id=ANY($2::uuid[]))`, params);
    return { openExplanationCount: openExplanations?.count ?? 0, pendingLeaveCount: pendingLeave?.count ?? 0, pendingOvertimeCount: pendingOvertime?.count ?? 0 };
  }
}
