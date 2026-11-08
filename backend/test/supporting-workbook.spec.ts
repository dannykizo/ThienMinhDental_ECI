import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSupportingWorkbook } from '../src/modules/reporting/supporting-workbook.js';
import { filterSupporting, type ReportRecord, type SupportingReports } from '../src/modules/reporting/supporting-report-data.js';
import type { SupportingDocument } from '../src/modules/reporting/reporting.service.js';

const identity = { employeeId: 'dev-only', employeeCode: '00001', fullName: '=HYPERLINK("https://example.invalid")', departmentId: 'dev-department', departmentName: 'Phòng kiểm thử development-only' };
const row: ReportRecord = { ...identity, id: 'dev-request', status: 'SUBMITTED', approvalStage: 'WAITING_ROUTING', requestedMinutes: 61, reason: 'development-only', workContent: 'development-only', workDate: '2024-02-01', startDate: '2024-02-01', endDate: '2024-02-01', durationType: 'HOURS', dayMinutes: 480 };
function document(): SupportingDocument {
  return { month: '2024-02', source: 'LIVE', revision: null, lockedAt: null, lockedByName: null, warnings: [], data: { capturedAt: '2024-02-01T01:00:00Z', leave: [row], overtime: [row], explanations: [row], balances: [{ ...identity, initialized: false, policyName: 'Phép năm', availableMinutes: 61, dayMinutes: 480, pendingMinutes: 61 }], balanceAdjustments: [], adjustments: [], audit: [] } };
}
async function open(kind: 'leave' | 'overtime' | 'explanations', report = document()): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await buildSupportingWorkbook(kind, report) as never); return book;
}
describe('R12 independent supporting Excel reports', () => {
  it.each(['leave', 'overtime', 'explanations'] as const)('exports %s even with pending routing and literal hostile text', async kind => {
    const book = await open(kind), summary = book.getWorksheet('Tổng hợp nhân viên')!;
    expect(summary.getCell('A2').value).toBe('00001'); expect(summary.getCell('B2').value).toBe(identity.fullName);
    expect(summary.getCell('F2').value).toBe(1);
    for (const sheet of book.worksheets) sheet.eachRow(r => r.eachCell(c => { expect(c.type).not.toBe(ExcelJS.ValueType.Formula); expect(c.type).not.toBe(ExcelJS.ValueType.Hyperlink); }));
    const detail = book.worksheets.find(s => s.name.startsWith('Chi tiết'))!;
    const note = detail.getRow(2).getCell(detail.columnCount);
    expect(note.value).toContain('Chưa có tuyến'); expect(note.fill).toMatchObject({ fgColor: { argb: 'FFFEF3C7' } });
    expect(detail.autoFilter).toBeDefined(); expect(detail.views[0].state).toBe('frozen');
  });
  it('converts hours/days without rounding away minutes, and labels uninitialized annual quotas', async () => {
    const book = await open('leave');
    expect(book.getWorksheet('Chi tiết nghỉ phép')!.getCell('M2').value).toBe(61 / 60);
    expect(book.getWorksheet('Chi tiết nghỉ phép')!.getCell('O2').value).toBe(61 / 480);
    const balance = book.getWorksheet('Quỹ phép năm')!;
    expect(balance.getCell('L2').value).toBe(61 / 60); expect(balance.getCell('M2').value).toBe(61 / 480); expect(balance.getCell('N2').value).toContain('chưa khởi tạo');
  });
  it('never adds full cross-month request minutes to monthly leave totals', async () => {
    const report = document(); report.data.leave = [{ ...row, status: 'APPROVED', endDate: '2024-03-01', requestedMinutes: 960 }];
    const book = await open('leave', report), total = book.getWorksheet('Tổng hợp nhân viên')!;
    expect(total.getCell('I2').value).toBe(0); expect(total.getCell('L2').value).toBe(1); expect(total.getCell('M2').value).toContain('giao tháng');
    expect(book.getWorksheet('Chi tiết nghỉ phép')!.getCell('L2').value).toBe(960);
  });
  it('only approved OT contributes; rejected/cancelled leave remains visible without reserving totals', async () => {
    const report = document(); report.data.overtime = [row, { ...row, id: 'approved', status: 'APPROVED', requestedMinutes: 90 }, { ...row, id: 'rejected', status: 'REJECTED', requestedMinutes: 120 }];
    const book = await open('overtime', report);
    expect(book.getWorksheet('Tổng hợp nhân viên')!.getCell('I2').value).toBe(90);
    expect(book.getWorksheet('Tổng hợp nhân viên')!.getCell('M2').value).toBe('');
    expect(book.getWorksheet('Chi tiết OT')!.getCell('H2').value).toBe(0); expect(book.getWorksheet('Chi tiết OT')!.getCell('H3').value).toBe(90); expect(book.getWorksheet('Chi tiết OT')!.getCell('H4').value).toBe(0);
  });
  it('empty reports still download with headers and metadata, rather than fake records', async () => {
    const report = document(); for (const key of ['leave', 'overtime', 'explanations', 'balances', 'adjustments', 'balanceAdjustments', 'audit'] as const) report.data[key] = [];
    for (const kind of ['leave', 'overtime', 'explanations'] as const) expect((await open(kind, report)).getWorksheet('Tổng hợp nhân viên')!.rowCount).toBe(1);
  });
  it('filters frozen staff/department data and related audit before workbook creation', () => {
    const data: SupportingReports = document().data; data.audit = [{ ...identity, requestId: row.id }, { ...identity, requestId: 'other' }];
    expect(filterSupporting(data, identity.employeeId).audit).toHaveLength(1);
    expect(filterSupporting(data, undefined, 'other').audit).toHaveLength(0);
    expect(filterSupporting(data, 'missing').leave).toHaveLength(0);
  });
});
