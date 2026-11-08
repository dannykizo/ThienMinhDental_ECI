import 'reflect-metadata';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildMonthlyWorkbook } from '../src/modules/reporting/monthly-workbook.js';
import { summarizeMonthly, type MonthlyRow } from '../src/modules/reporting/domain/monthly-report.js';
import { ReportingService, type MonthlyDocument } from '../src/modules/reporting/reporting.service.js';
import type { DataSource } from 'typeorm';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { ReportingController } from '../src/modules/reporting/reporting.controller.js';
import { ROLES_METADATA_KEY } from '../src/modules/auth/presentation/roles.decorator.js';

const blockers = { openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 };
const row: MonthlyRow = { employeeId: 'development-only', employeeCode: '0001', fullName: '=HYPERLINK("https://example.invalid")', departmentName: 'Phòng thử nghiệm', workDate: '2024-02-01', checkedInAt: '2024-02-01T01:00:00Z', checkedOutAt: '2024-02-01T09:01:00Z', status: 'PRESENT', riskFlags: ['LATE'], adjustmentCount: 1, workedMinutes: 481, requiredWorkMinutes: 480, overtimeMinutes: 61, isFullWorkday: true, attendanceType: 'OFFICE' };
function document(rows: MonthlyRow[]): MonthlyDocument {
  return { month: '2024-02', rows, summary: summarizeMonthly(rows, blockers, 0), period: { id: 'period', periodMonth: '2024-02-01', status: 'LOCKED', lockedAt: row.checkedOutAt, lockedByName: 'Development only', reopenedAt: null, reopenedByName: null, reopenReason: null, revision: 1 }, versions: [], source: 'SNAPSHOT', revision: 1, lockedAt: row.checkedOutAt, lockedByName: 'Development only' };
}
describe('R12 Excel contract and pure totals', () => {
  it('keeps partial leave separate, minutes exact and OT independent', () => {
    expect(summarizeMonthly([row, { ...row, workDate: '2024-02-02', status: 'PARTIAL_LEAVE', workedMinutes: 240, overtimeMinutes: 0, isFullWorkday: false }], blockers, 0))
      .toMatchObject({ leaveDays: 0, partialLeaveDays: 1, totalWorkedMinutes: 721, totalOvertimeMinutes: 61, fullWorkdays: 1, employeeCount: 1 });
  });
  it('round-trips five sheets, literal hostile text, leading zeros, dates and unrounded numeric hours', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await buildMonthlyWorkbook(document([row]), 'Development only') as never);
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(['Thông tin kỳ', 'Tổng hợp nhân viên', 'Ma trận công ngày', 'Chi tiết ngày', 'Đối soát']);
    const summary = book.getWorksheet('Tổng hợp nhân viên')!;
    expect(summary.getCell('A2').value).toBe('0001'); expect(summary.getCell('B2').value).toBe(row.fullName); expect(summary.getCell('B2').type).toBe(ExcelJS.ValueType.String);
    expect(summary.getCell('L2').value).toBe(481); expect(summary.getCell('M2').value).toBe(481 / 60); expect(summary.getCell('N2').value).toBe(61);
    const detail = book.getWorksheet('Chi tiết ngày')!;
    expect(detail.getCell('A2').value).toBeInstanceOf(Date); expect((detail.getCell('E2').value as Date).getUTCHours()).toBe(8);
    expect(detail.getCell('N2').value).toBe('Văn phòng'); expect(detail.getCell('G2').value).toBe(481);
    expect(book.getWorksheet('Ma trận công ngày')!.columnCount).toBe(32);
    expect(book.getWorksheet('Ma trận công ngày')!.getCell('D2').value).toBe('VP*');
    expect(summary.views[0].state).toBe('frozen');
    for (const sheet of book.worksheets) sheet.eachRow(r => r.eachCell(cell => {
      expect(cell.type).not.toBe(ExcelJS.ValueType.Formula); expect(cell.type).not.toBe(ExcelJS.ValueType.Hyperlink);
      if (typeof cell.value === 'string') expect(cell.value).not.toMatch(/latitude|longitude|password_hash|private_key/i);
    }));
  });
  it.each(['', '2024-00', '2024-13', '24-02', undefined])('rejects invalid month %s before DB access', async month => {
    await expect(new ReportingService({} as DataSource).document(month as string)).rejects.toMatchObject({ response: { code: 'INVALID_REPORT_MONTH' } });
  });
  it.each(['0', '-1', '1.5', '01', 'NaN'])('rejects invalid revision %s', async revision => {
    await expect(new ReportingService({} as DataSource).document('2024-02', undefined, undefined, revision)).rejects.toMatchObject({ response: { code: 'INVALID_REPORT_REVISION' } });
  });
  it('rejects blank reopen reason and preserves Chief Accountant-only authority', async () => {
    const service = new ReportingService({} as DataSource), actor = { id: 'dev', email: 'dev@development.invalid', employeeId: null, displayName: 'Dev', roles: [RoleCode.ChiefAccountant] };
    await expect(service.reopenPeriod(actor, '2024-02', '     ')).rejects.toMatchObject({ response: { code: 'INVALID_PERIOD_REASON' } });
    await expect(service.reopenPeriod({ ...actor, roles: [RoleCode.Admin] }, '2024-02', 'Valid reason')).rejects.toMatchObject({ status: 403 });
  });
  it('document/export require global report roles, never scoped grants alone', () => {
    for (const name of ['document', 'export', 'exportLeave', 'exportOvertime', 'exportExplanations'] as const) {
      // Metadata belongs to the method itself; do not invoke/rebind it.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const handler = ReportingController.prototype[name];
      expect(Reflect.getMetadata(ROLES_METADATA_KEY, handler)).toEqual([RoleCode.Admin, RoleCode.ChiefAccountant]);
    }
  });
});
