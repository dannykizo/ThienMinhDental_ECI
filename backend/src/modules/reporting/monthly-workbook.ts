import ExcelJS from 'exceljs';
import type { MonthlyDocument } from './reporting.service.js';
import { summarizeMonthly, type MonthlyRow } from './domain/monthly-report.js';

const noBlockers = { openExplanationCount: 0, pendingLeaveCount: 0, pendingOvertimeCount: 0 };
const statusLabels: Record<string, string> = { PRESENT: 'Hiện diện', BUSINESS_TRIP: 'Hiện trường', LEAVE: 'Nghỉ cả ngày', PARTIAL_LEAVE: 'Nghỉ một phần', ABSENT: 'Vắng', INCOMPLETE: 'Thiếu check-out' };
const statusCodes: Record<string, string> = { PRESENT: 'VP', BUSINESS_TRIP: 'HT', LEAVE: 'P', PARTIAL_LEAVE: 'PP', ABSENT: 'V', INCOMPLETE: 'T' };

// Excel dates have no timezone; shift the serialized value to the Vietnam wall clock.
export function localDate(value: string | null): Date | null {
  return value ? new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000) : null;
}

export function style(sheet: ExcelJS.Worksheet): void {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF60328E' } };
  sheet.getRow(1).height = 34;
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
}

export function highlightNote(row: ExcelJS.Row, key: string, severe = false): void {
  const cell = row.getCell(key);
  if (!cell.value) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: severe ? 'FFFEE2E2' : 'FFFEF3C7' } };
  cell.font = { color: { argb: severe ? 'FF991B1B' : 'FF92400E' } };
  cell.alignment = { wrapText: true, vertical: 'top' };
  const text = typeof cell.value === 'string' ? cell.value : '';
  const width = row.worksheet.getColumn(key).width ?? 60;
  row.height = Math.min(409, Math.max(row.height ?? 20, 48, (Math.ceil(text.length / width) + text.split('\n').length - 1) * 15 + 8));
}

export async function buildMonthlyWorkbook(report: MonthlyDocument, exportedBy = 'Người dùng hệ thống', filters: { employeeId?: string; departmentId?: string } = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Thiên Minh Dental Workforce';
  const metadata = workbook.addWorksheet('Thông tin kỳ');
  metadata.columns = [{ header: 'Thông tin', key: 'label', width: 34 }, { header: 'Giá trị', key: 'value', width: 100 }];
  for (const [label, value] of [
    ['Đơn vị', 'Thiên Minh Dental Workforce'], ['Tháng', report.month],
    ['Trạng thái dữ liệu', report.source === 'SNAPSHOT' ? 'Đã chốt — bản lưu bất biến' : 'Tạm tính — dữ liệu kỳ mở'],
    ['Trạng thái kỳ hiện tại', report.period.status === 'LOCKED' ? 'Đã khóa' : 'Đang mở'],
    ['Phiên bản đã chốt', report.revision ?? 'Chưa chốt'], ['Người chốt', report.lockedByName ?? '—'],
    ['Thời điểm chốt (+07:00)', localDate(report.lockedAt)], ['Người xuất', exportedBy],
    ['Thời điểm xuất (+07:00)', localDate(new Date().toISOString())],
    ['Phạm vi nhân viên (UUID)', filters.employeeId ?? 'Tất cả'], ['Phạm vi phòng ban (UUID)', filters.departmentId ?? 'Tất cả'],
    ['Quy tắc', 'Giờ làm thực tế, ngày đủ công, nghỉ phép và OT riêng. Không tính lương; không cộng giờ làm với OT để tránh tính trùng.'],
    ['Nghỉ một phần', 'Đếm ngày có nghỉ nửa ngày/theo giờ, KHÔNG phải số ngày phép quy đổi. Thời lượng/quỹ đối soát tại báo cáo nghỉ phép riêng.'],
    ['Chú giải ma trận', 'VP: văn phòng; HT: hiện trường; P: nghỉ cả ngày; PP: nghỉ một phần; V: vắng; T: thiếu check-out; —: không có dòng dữ liệu. *: cảnh báo/điều chỉnh.'],
    ['Giới hạn', 'Không chứa GPS, ảnh, mật khẩu hoặc khóa thiết bị. Phòng ban là projection hiện tại lúc lập bản; chưa tái dựng lịch sử cơ cấu.'],
    ['Dữ liệu chưa hoàn tất (toàn công ty)', `${report.summary.incompleteBlockerCount} ngày thiếu check-out; ${report.summary.openExplanationCount} giải trình; ${report.summary.pendingLeaveCount} đơn phép; ${report.summary.pendingOvertimeCount} phiếu OT chờ. Xuất vẫn được; chốt kỳ phải xử lý hết.`],
    ['Lưu ý xuất dữ liệu', (report.warnings ?? []).join(' ') || 'Vàng: cần đối soát/chờ xử lý; đỏ: thiếu dữ liệu. Thiếu check-out: chưa tính được giờ công, không coi 0 phút là kết quả cuối cùng.'],
  ] as Array<[string, ExcelJS.CellValue]>) {
    const row = metadata.addRow({ label, value });
    if (value instanceof Date) row.getCell('value').numFmt = 'dd/mm/yyyy hh:mm:ss';
    if (label === 'Lưu ý xuất dữ liệu' || label === 'Dữ liệu chưa hoàn tất (toàn công ty)' && report.summary.blockerCount > 0) highlightNote(row, 'value');
  }
  metadata.getColumn('value').alignment = { wrapText: true, vertical: 'top' };
  style(metadata);

  const groups = new Map<string, MonthlyRow[]>();
  for (const row of report.rows) {
    const group = groups.get(row.employeeId) ?? [];
    group.push(row); groups.set(row.employeeId, group);
  }
  const totals = workbook.addWorksheet('Tổng hợp nhân viên');
  totals.columns = [
    { header: 'Mã NV', key: 'employeeCode', width: 18 }, { header: 'Họ tên', key: 'fullName', width: 30 }, { header: 'Phòng ban', key: 'departmentName', width: 26 },
    { header: 'Ngày có dữ liệu', key: 'scheduledDays', width: 16 }, { header: 'Ngày văn phòng', key: 'officeDays', width: 16 }, { header: 'Ngày hiện trường', key: 'fieldDays', width: 16 },
    { header: 'Ngày nghỉ cả ngày', key: 'leaveDays', width: 16 }, { header: 'Ngày có nghỉ một phần', key: 'partialLeaveDays', width: 18 }, { header: 'Ngày đủ công', key: 'fullWorkdays', width: 16 },
    { header: 'Ngày thiếu check-out', key: 'incompleteDays', width: 18 }, { header: 'Ngày vắng', key: 'absentDays', width: 14 },
    { header: 'Phút làm thực tế', key: 'totalWorkedMinutes', width: 18 }, { header: 'Giờ làm thực tế', key: 'workedHours', width: 18 },
    { header: 'Phút OT đã duyệt', key: 'totalOvertimeMinutes', width: 18 }, { header: 'Giờ OT đã duyệt', key: 'overtimeHours', width: 18 }, { header: 'Ngày cần xem', key: 'reviewDays', width: 16 },
  ];
  for (const rows of groups.values()) {
    const summary = summarizeMonthly(rows, noBlockers, 0);
    totals.addRow({ employeeCode: rows[0].employeeCode, fullName: rows[0].fullName, departmentName: rows[0].departmentName, ...summary,
      // Store unrounded numeric hours; formatting must not change minute totals.
      workedHours: summary.totalWorkedMinutes / 60, overtimeHours: summary.totalOvertimeMinutes / 60 });
  }
  totals.getColumn('workedHours').numFmt = '0.00'; totals.getColumn('overtimeHours').numFmt = '0.00';
  style(totals);

  const matrix = workbook.addWorksheet('Ma trận công ngày');
  const dayCount = new Date(Date.UTC(Number(report.month.slice(0, 4)), Number(report.month.slice(5, 7)), 0)).getUTCDate();
  matrix.columns = [
    { header: 'Mã NV', key: 'employeeCode', width: 18 }, { header: 'Họ tên', key: 'fullName', width: 30 }, { header: 'Phòng ban', key: 'departmentName', width: 26 },
    ...Array.from({ length: dayCount }, (_, i) => ({ header: String(i + 1).padStart(2, '0'), key: `d${i + 1}`, width: 7 })),
  ];
  for (const rows of groups.values()) {
    const data: Record<string, string | null> = { employeeCode: rows[0].employeeCode, fullName: rows[0].fullName, departmentName: rows[0].departmentName };
    for (let day = 1; day <= dayCount; day++) data[`d${day}`] = '—';
    for (const row of rows) data[`d${Number(row.workDate.slice(8))}`] = `${statusCodes[row.status] ?? row.status}${row.riskFlags.length || row.adjustmentCount ? '*' : ''}`;
    matrix.addRow(data);
  }
  style(matrix); matrix.views = [{ state: 'frozen', ySplit: 1, xSplit: 3 }];

  const detail = workbook.addWorksheet('Chi tiết ngày');
  detail.columns = [
    { header: 'Ngày', key: 'workDate', width: 14 }, { header: 'Mã NV', key: 'employeeCode', width: 18 }, { header: 'Họ tên', key: 'fullName', width: 30 }, { header: 'Phòng ban', key: 'departmentName', width: 26 },
    { header: 'Check-in (+07:00)', key: 'checkedInAt', width: 24 }, { header: 'Check-out (+07:00)', key: 'checkedOutAt', width: 24 },
    { header: 'Phút làm thực tế', key: 'workedMinutes', width: 18 }, { header: 'Phút chuẩn', key: 'requiredWorkMinutes', width: 14 },
    { header: 'Phút OT đã duyệt', key: 'overtimeMinutes', width: 18 }, { header: 'Đủ công', key: 'isFullWorkday', width: 12 },
    { header: 'Trạng thái', key: 'status', width: 20 }, { header: 'Cảnh báo', key: 'riskFlags', width: 32 }, { header: 'Số điều chỉnh', key: 'adjustmentCount', width: 16 }, { header: 'Hình thức', key: 'attendanceType', width: 18 },
    { header: 'Ghi chú đối soát', key: 'note', width: 60 },
  ];
  const dailyNote = (row: MonthlyRow): string => [row.status === 'INCOMPLETE' ? 'Thiếu check-out — chưa tính được giờ công cuối cùng.' : '',
    ...((report.issues ?? []).filter(issue => issue.employeeId === row.employeeId && issue.workDate === row.workDate).map(issue => issue.note)),
    !row.departmentName ? 'Chưa có phòng ban.' : '', row.riskFlags.length ? 'Có cảnh báo cần đối soát.' : '', row.adjustmentCount ? 'Đã điều chỉnh; xem lịch sử ở báo cáo giải trình.' : ''].filter(Boolean).join(' ');
  for (const row of report.rows) {
    const added = detail.addRow({ ...row, workDate: new Date(`${row.workDate}T00:00:00Z`), checkedInAt: localDate(row.checkedInAt), checkedOutAt: localDate(row.checkedOutAt), note: dailyNote(row),
    status: statusLabels[row.status] ?? row.status, isFullWorkday: row.isFullWorkday ? 'Có' : 'Không', riskFlags: row.riskFlags.join(', '),
    attendanceType: row.attendanceType === 'BUSINESS_TRIP' ? 'Hiện trường' : row.attendanceType === 'OFFICE' ? 'Văn phòng' : '—' });
    highlightNote(added, 'note', row.status === 'INCOMPLETE');
  }
  detail.getColumn('workDate').numFmt = 'dd/mm/yyyy';
  for (const key of ['checkedInAt', 'checkedOutAt']) detail.getColumn(key).numFmt = 'dd/mm/yyyy hh:mm:ss';
  style(detail);
  const review = workbook.addWorksheet('Đối soát');
  review.columns = [{ header: 'Ngày', key: 'workDate', width: 14 }, { header: 'Mã NV', key: 'employeeCode', width: 18 }, { header: 'Họ tên', key: 'fullName', width: 30 }, { header: 'Cảnh báo', key: 'riskFlags', width: 40 }, { header: 'Số điều chỉnh', key: 'adjustmentCount', width: 16 }, { header: 'Ghi chú / mục chưa hoàn tất', key: 'note', width: 65 }];
  for (const row of report.rows.filter(row => dailyNote(row))) {
    const added = review.addRow({ workDate: new Date(`${row.workDate}T00:00:00Z`), employeeCode: row.employeeCode, fullName: row.fullName, riskFlags: row.riskFlags.join(', '), adjustmentCount: row.adjustmentCount, note: dailyNote(row) });
    highlightNote(added, 'note', row.status === 'INCOMPLETE');
  }
  // Pending requests without a schedule/attendance row still appear here.
  for (const issue of report.issues ?? []) {
    if (report.rows.some(row => row.employeeId === issue.employeeId && row.workDate === issue.workDate)) continue;
    highlightNote(review.addRow({ ...issue, workDate: new Date(`${issue.workDate}T00:00:00Z`) }), 'note');
  }
  review.getColumn('workDate').numFmt = 'dd/mm/yyyy'; style(review);
  // All user-provided text is an ExcelJS string, never a formula or hyperlink object.
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
