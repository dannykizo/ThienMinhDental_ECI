import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { summarizeEmployees, summarizeMonthly, type MonthlyRow } from '../src/modules/reporting/domain/monthly-report.js';
import { ReportingService, type MonthlyDocument } from '../src/modules/reporting/reporting.service.js';
import { ManagedModulesService } from '../src/modules/organization-access/application/managed-modules.service.js';
import { KpiController } from '../src/modules/kpi/kpi.controller.js';
import { ROLES_METADATA_KEY } from '../src/modules/auth/presentation/roles.decorator.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';

const blockers = { openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 };
const row: MonthlyRow = { employeeId: 'development-only', employeeCode: '00001', fullName: 'R13 DEVELOPMENT ONLY', departmentId: 'outside-department', departmentName: 'PRIVATE PRIMARY DEPARTMENT', workDate: '2024-02-01',
  checkedInAt: '2024-02-01T01:00:00Z', checkedOutAt: '2024-02-01T09:01:00Z', attendanceType: 'BUSINESS_TRIP', status: 'PARTIAL_LEAVE', riskFlags: ['LATE', 'EARLY_LEAVE'], adjustmentCount: 2, workedMinutes: 481, requiredWorkMinutes: 480, overtimeMinutes: 61, isFullWorkday: true };
function report(rows: MonthlyRow[]): MonthlyDocument {
  return { month: '2024-02', rows, summary: summarizeMonthly(rows, blockers, 0), source: 'SNAPSHOT', revision: 1, lockedAt: row.checkedOutAt, lockedByName: 'Development only',
    period: { id: null, periodMonth: '2024-02-01', status: 'LOCKED', lockedAt: null, lockedByName: null, reopenedAt: null, reopenedByName: null, reopenReason: null, revision: 1 }, versions: [], warnings: [] };
}
const actor = { id: 'dev-admin', employeeId: null, email: 'development@invalid.test', displayName: 'Development only', roles: [RoleCode.Admin] };
describe('R13 report-based Dashboard/KPI contracts', () => {
  it('uses the report categories: partial leave does not become a full leave day or erase field work', () => {
    expect(summarizeEmployees([row])[0]).toMatchObject({ scheduledDays: 1, partialLeaveDays: 1, leaveDays: 0, fieldDays: 1, reviewDays: 1, totalWorkedMinutes: 481, totalOvertimeMinutes: 61, fullWorkdays: 1 });
  });
  it('group totals reconcile exactly to the same monthly summary without rounding or fake scores', () => {
    const rows = [row, { ...row, workDate: '2024-02-02', status: 'LEAVE', attendanceType: null, checkedInAt: null, checkedOutAt: null, workedMinutes: 0, overtimeMinutes: 0, riskFlags: [], adjustmentCount: 0, isFullWorkday: false },
      { ...row, employeeId: 'dev-other', attendanceType: 'OFFICE', status: 'PRESENT', overtimeMinutes: 0 }];
    const groups = summarizeEmployees(rows), total = summarizeMonthly(rows, blockers, 0);
    for (const key of ['scheduledDays', 'presentDays', 'businessTripDays', 'leaveDays', 'partialLeaveDays', 'officeDays', 'fieldDays', 'fullWorkdays', 'incompleteDays', 'absentDays', 'reviewDays', 'totalWorkedMinutes', 'totalOvertimeMinutes'] as const) expect(groups.reduce((sum, group) => sum + group[key], 0)).toBe(total[key]);
    expect(groups.every(group => !('score' in group) && !('salary' in group))).toBe(true);
    expect(summarizeEmployees([])).toEqual([]);
  });
  it('KPI preserves exact snapshot metadata and delegates validation/revision selection to R12', async () => {
    const service = new ReportingService({} as DataSource), document = report([row]);
    const read = vi.spyOn(service, 'document').mockResolvedValue(document);
    const kpi = await service.kpiDocument('2024-02', '1');
    expect(read).toHaveBeenCalledWith('2024-02', undefined, undefined, '1');
    expect(kpi).toMatchObject({ source: 'SNAPSHOT', revision: 1, summary: document.summary }); expect(kpi.rows).toEqual(summarizeEmployees(document.rows));
    expect(await service.kpi('2024-02')).toEqual(kpi.rows);
    expect(kpi).not.toHaveProperty('issues');
  });
  it('new KPI document keeps global report roles; grants alone do not unlock KPI/export', () => {
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, KpiController)).toEqual([RoleCode.Admin, RoleCode.ChiefAccountant]);
  });
  it('Dashboard has real server date, unique daily warnings, effective branch scope and no global notice leak', async () => {
    const query = vi.fn((sql: string): Promise<unknown[]> => Promise.resolve(sql.includes('now()::text') ? [{ workDate: row.workDate, asOf: row.checkedOutAt }]
      : sql.includes('FROM user_branch_scopes') ? [{ id: row.employeeId }] : [{ activeEmployees: 1, activeTrips: 0, pendingLeave: 0, openExplanations: 0, pendingOvertime: 0, publishedAnnouncements: 1 }]));
    const manager = { query }, db = { transaction: (_isolation: string, callback: (reader: typeof manager) => Promise<unknown>) => callback(manager) } as unknown as DataSource;
    const service = new ReportingService(db), read = vi.spyOn(service, 'document').mockResolvedValue(report([row]));
    const result = await service.dashboard({ ...actor, roles: [RoleCode.AreaManager] });
    expect(result).toMatchObject({ attendanceToday: 1, reviewRequired: 1, incompleteToday: 0, scopeLabel: 'Chi nhánh được phân quyền', attendanceSource: 'SNAPSHOT' });
    expect(read).toHaveBeenCalledWith('2024-02', undefined, undefined, undefined, [row.employeeId], manager);
    const scopeSql = query.mock.calls.find(([sql]) => sql.includes('FROM user_branch_scopes'))![0];
    expect(scopeSql).toContain('a.effective_from<=$2::date'); expect(scopeSql).toContain('a.effective_to>=$2::date');
    const noticeSql = query.mock.calls.find(([sql]) => sql.includes('FROM announcements'))![0];
    expect(noticeSql).toContain('FROM announcement_recipients'); expect(noticeSql).toContain('employee_disciplinary_actions');
  });
  it('ordinary employees/scoped-only managers cannot call the global dashboard service', async () => {
    await expect(new ReportingService({} as DataSource).dashboard({ ...actor, roles: [RoleCode.Employee] })).rejects.toMatchObject({ status: 403 });
  });
  it('managed attendance projects only allowed fields, never another department or future report metadata', async () => {
    const manager = { query: vi.fn() }, db = { manager, transaction: (_isolation: string, callback: (reader: typeof manager) => Promise<unknown>) => callback(manager) } as unknown as DataSource;
    const reporting = { document: vi.fn().mockResolvedValue(report([row])) } as unknown as ReportingService;
    const service = new ManagedModulesService(db, reporting); vi.spyOn(service, 'employeeIds').mockResolvedValue([row.employeeId]);
    const result = await service.attendance(actor, '2024-02');
    expect(result[0]).toMatchObject({ departmentName: null, workedMinutes: 481 }); expect(result[0]).not.toHaveProperty('departmentId');
    const scoped = await service.reports(actor, '2024-02') as { employees: Array<{ leaveDays: number; partialLeaveDays: number; workedMinutes: number }>; summary: unknown; source: string };
    expect(scoped.employees[0]).toMatchObject({ leaveDays: 0, partialLeaveDays: 1, workedMinutes: 481 }); expect(scoped.summary).toEqual(report([row]).summary); expect(scoped.source).toBe('SNAPSHOT');
  });
});
