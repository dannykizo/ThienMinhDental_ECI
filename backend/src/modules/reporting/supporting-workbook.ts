import ExcelJS from 'exceljs';
import type { SupportingDocument } from './reporting.service.js';
import { highlightNote, localDate, style } from './monthly-workbook.js';
import { requestNote, type ReportKind, type ReportRecord } from './supporting-report-data.js';

const titles = { leave: 'Nghỉ phép và số dư', overtime: 'Phiếu OT', explanations: 'Giải trình và điều chỉnh' };
const statuses: Record<string, string> = { REQUESTED: 'Chờ nhân viên phản hồi', SUBMITTED: 'Chờ xử lý', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };
const stages: Record<string, string> = { EMPLOYEE_RESPONSE: 'Chờ phản hồi', WAITING_ROUTING: 'Chờ cấu hình tuyến', LEADER_CONFIRMATION: 'Leader xác nhận', HEAD_APPROVAL: 'Trưởng phòng duyệt', COMPLETED: 'Hoàn tất' };
type Column = { header: string; key: string; width: number };
const col = (header: string, key: string, width = 24): Column => ({ header, key, width });
const identity = [col('Mã NV', 'employeeCode', 18), col('Họ tên', 'fullName', 30), col('Phòng ban', 'departmentName', 26)];
const processing = [col('Trạng thái', 'status'), col('Bước xử lý', 'approvalStage'), col('Team', 'teamName'), col('Leader theo tuyến', 'leaderName'), col('Trưởng phòng theo tuyến', 'headName'),
  col('Người xác nhận', 'confirmedByName'), col('Lúc xác nhận (+07)', 'confirmedAt'), col('Ghi chú xác nhận', 'confirmationNote', 40),
  col('Người quyết định', 'reviewedByName'), col('Lúc quyết định (+07)', 'reviewedAt'), col('Ghi chú quyết định', 'reviewNote', 40), col('Cách quyết định', 'decisionMethod'), col('Lý do Admin dự phòng', 'adminOverrideReason', 40)];

function sheet(book: ExcelJS.Workbook, name: string, columns: Column[], rows: ReportRecord[]): ExcelJS.Worksheet {
  const result = book.addWorksheet(name); result.columns = columns;
  for (const row of rows) {
    const values: Record<string, ExcelJS.CellValue> = { ...row };
    for (const column of columns) {
      if (/(At)$/.test(column.key) && row[column.key]) values[column.key] = localDate(String(row[column.key]));
      if (/^(workDate|startDate|endDate)$/.test(column.key) && row[column.key]) values[column.key] = new Date(`${String(row[column.key])}T00:00:00Z`);
    }
    const added = result.addRow(values);
    if (columns.some(c => c.key === 'note')) highlightNote(added, 'note', String(row.note ?? '').includes('Thiếu') || Number(row.availableMinutes) < 0);
    added.alignment = { wrapText: true, vertical: 'top' };
    const lines = Math.max(1, ...columns.map(column => typeof row[column.key] === 'string' ? Math.ceil(String(row[column.key]).length / column.width) + String(row[column.key]).split('\n').length - 1 : 1));
    added.height = Math.min(409, Math.max(added.height ?? 0, 44, lines * 15 + 8));
  }
  for (const column of columns) {
    if (/(At)$/.test(column.key)) result.getColumn(column.key).numFmt = 'dd/mm/yyyy hh:mm:ss';
    if (/^(workDate|startDate|endDate)$/.test(column.key)) result.getColumn(column.key).numFmt = 'dd/mm/yyyy';
    if (/Hours|Days/.test(column.key)) result.getColumn(column.key).numFmt = '0.00';
  }
  style(result);
  const statusIndex = columns.findIndex(c => c.key === 'status');
  if (statusIndex >= 0 && rows.length) {
    const letter = result.getColumn(statusIndex + 1).letter;
    result.addConditionalFormatting({ ref: `${letter}2:${letter}${rows.length + 1}`, rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Chờ xử lý"'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }, font: { color: { argb: 'FF92400E' } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Đã duyệt"'], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }, font: { color: { argb: 'FF166534' } } } },
    ] });
  }
  return result;
}

export async function buildSupportingWorkbook(kind: ReportKind, report: SupportingDocument, exportedBy = 'Người dùng hệ thống', filters: { employeeId?: string; departmentId?: string } = {}): Promise<Buffer> {
  const book = new ExcelJS.Workbook(); book.creator = 'Thiên Minh Dental Workforce';
  const info = book.addWorksheet('Thông tin kỳ'); info.columns = [col('Thông tin', 'label', 36), col('Giá trị', 'value', 100)];
  info.getColumn('value').alignment = { wrapText: true, vertical: 'top' };
  const details = report.data[kind];
  for (const [label, value] of [
    ['Báo cáo', titles[kind]], ['Tháng', report.month], ['Nguồn dữ liệu', report.source === 'SNAPSHOT' ? 'Bản lưu bất biến tại lúc chốt' : 'Dữ liệu hiện tại — tạm tính để đối soát'],
    ['Phiên bản chốt', report.revision ?? 'Chưa có bản lưu chi tiết'], ['Người chốt', report.lockedByName ?? '—'], ['Thời điểm chốt (+07)', localDate(report.lockedAt)],
    ['Dữ liệu lấy lúc (+07)', localDate(report.data.capturedAt)], ['Người xuất', exportedBy], ['Thời điểm xuất (+07)', localDate(new Date().toISOString())],
    ['Phạm vi nhân viên (UUID)', filters.employeeId ?? 'Tất cả'], ['Phạm vi phòng ban (UUID)', filters.departmentId ?? 'Tất cả'], ['Số đơn trong phạm vi', details.length],
    ['Mục chưa hoàn tất', details.filter(r => ['REQUESTED', 'SUBMITTED'].includes(String(r.status))).length],
    ['Lưu ý', report.warnings.join(' ') || 'Vàng: chờ xử lý/cần đối soát. Đỏ: thiếu thông tin/số dư âm. Xanh: đã duyệt. Không chặn xuất vì dữ liệu chưa hoàn tất.'],
    ['Giới hạn', 'Không chứa tọa độ, đường dẫn ảnh, mật khẩu, token hoặc khóa thiết bị. Phòng ban/tên người xử lý theo dữ liệu tại lúc lấy báo cáo.'],
    ['Quy tắc đơn vị', 'Phút là giá trị gốc, giờ = phút/60 (hiển thị 2 số lẻ, không làm tròn dữ liệu gốc). Không tính lương.'],
  ] as Array<[string, ExcelJS.CellValue]>) {
    const row = info.addRow({ label, value }); row.alignment = { wrapText: true, vertical: 'top' }; row.height = 36;
    if (value instanceof Date) row.getCell('value').numFmt = 'dd/mm/yyyy hh:mm:ss';
    if (label === 'Lưu ý') highlightNote(row, 'value');
  }
  style(info);
  const requests: ReportRecord[] = details.map(row => ({ ...row, status: statuses[String(row.status)] ?? row.status, approvalStage: stages[String(row.approvalStage)] ?? row.approvalStage,
    decisionMethod: row.decisionMethod === 'ADMIN_FALLBACK' ? 'Admin dự phòng' : row.decisionMethod === 'ROUTED' ? 'Theo tuyến' : '—', note: requestNote(row) }));
  const summary = new Map<string, ReportRecord>();
  for (const row of details) {
    const total = summary.get(row.employeeId) ?? { employeeId: row.employeeId, employeeCode: row.employeeCode, fullName: row.fullName, departmentId: row.departmentId, departmentName: row.departmentName,
      requestCount: 0, approvedCount: 0, pendingCount: 0, rejectedCount: 0, cancelledCount: 0, approvedMinutes: 0, pendingMinutes: 0, crossMonthCount: 0, note: '' };
    total.requestCount = Number(total.requestCount) + 1;
    const key = row.status === 'APPROVED' ? 'approvedCount' : row.status === 'REJECTED' ? 'rejectedCount' : row.status === 'CANCELLED' ? 'cancelledCount' : 'pendingCount';
    total[key] = Number(total[key]) + 1;
    const crossMonth = kind === 'leave' && (String(row.startDate).slice(0, 7) !== report.month || String(row.endDate).slice(0, 7) !== report.month);
    if (crossMonth) { total.crossMonthCount = Number(total.crossMonthCount) + 1; total.note = 'Có đơn giao tháng: không cộng thời lượng toàn đơn vào tổng phút tháng. Đối soát riêng tại chi tiết.'; }
    else if (row.status === 'APPROVED') total.approvedMinutes = Number(total.approvedMinutes) + Number(row.requestedMinutes ?? 0);
    else if (row.status === 'SUBMITTED') total.pendingMinutes = Number(total.pendingMinutes) + Number(row.requestedMinutes ?? 0);
    summary.set(row.employeeId, total);
  }
  sheet(book, 'Tổng hợp nhân viên', [...identity, col('Số đơn', 'requestCount', 12), col('Đã duyệt', 'approvedCount', 12), col('Chưa hoàn tất', 'pendingCount', 16), col('Từ chối', 'rejectedCount', 12), col('Đã hủy', 'cancelledCount', 12),
    ...(kind !== 'explanations' ? [col('Phút đã duyệt trong tháng', 'approvedMinutes'), col('Giờ đã duyệt trong tháng', 'approvedHours'), col('Phút chờ trong tháng', 'pendingMinutes'), col('Đơn giao tháng', 'crossMonthCount', 16)] : []), col('Ghi chú', 'note', 65)],
    [...summary.values()].map(r => ({ ...r, approvedHours: Number(r.approvedMinutes) / 60 })));
  if (kind === 'leave') {
    info.addRow({ label: 'Đơn giao tháng', value: 'Chi tiết giữ nguyên phút toàn đơn, KHÔNG chia tự động theo tháng; tổng tháng loại thời lượng các đơn giao tháng để tránh cộng trùng.' }).height = 42;
    info.addRow({ label: 'Quỹ phép năm', value: `Năm ${report.month.slice(0, 4)}, tại thời điểm lấy dữ liệu/chốt (KHÔNG phải số dư cuối tháng). Chỉ nhân viên/chính sách còn hoạt động và có theo dõi quỹ. Giữ chỗ/trừ quỹ gồm cả đơn ngoài tháng.` }).height = 54;
    info.addRow({ label: 'Ngày quy đổi', value: 'Phút toàn đơn / phút-ngày chính sách tại thời điểm lấy dữ liệu. Chưa lưu phút-ngày tại lúc nộp đơn; không coi là số ngày lịch hoặc đơn vị lịch sử nếu chính sách đã đổi.' }).height = 54;
    sheet(book, 'Chi tiết nghỉ phép', [...identity, col('Mã đơn (UUID)', 'id', 38), col('Chính sách', 'policyName'), col('Từ ngày', 'startDate', 16), col('Đến ngày', 'endDate', 16), col('Loại thời lượng', 'durationLabel'), col('Buổi', 'halfDayPeriod', 12),
      col('Từ giờ', 'startTime', 12), col('Đến giờ', 'endTime', 12), col('Phút toàn đơn', 'requestedMinutes', 18), col('Giờ toàn đơn', 'requestedHours', 18), col('Phút/ngày quy đổi', 'dayMinutes', 20), col('Ngày quy đổi toàn đơn', 'requestedDays'), col('Lý do', 'reason', 45),
      ...processing, col('Nộp lúc (+07)', 'submittedAt'), col('Người hủy', 'cancelledByName'), col('Hủy lúc (+07)', 'cancelledAt'), col('Lý do hủy', 'cancellationReason', 40), col('Ghi chú đối soát', 'note', 65)],
      requests.map(r => ({ ...r, durationLabel: r.durationType === 'HALF_DAY' ? 'Nửa ngày' : r.durationType === 'HOURS' ? 'Theo giờ' : 'Cả ngày', requestedHours: Number(r.requestedMinutes) / 60,
        requestedDays: Number(r.dayMinutes) > 0 ? Number(r.requestedMinutes) / Number(r.dayMinutes) : null,
        note: `${String(r.note)} ${String(r.startDate).slice(0, 7) !== report.month || String(r.endDate).slice(0, 7) !== report.month ? 'Đơn giao tháng — xem phút toàn đơn, chưa phân bổ riêng từng tháng.' : ''} ${Number(r.dayMinutes) > 0 ? '' : 'Thiếu phút/ngày chính sách; không quy đổi ngày.'}`.trim() })));
    sheet(book, 'Quỹ phép năm', [...identity, col('Chính sách', 'policyName'), col('Phút/ngày', 'dayMinutes', 16), col('Phút cấp năm', 'entitlementMinutes', 18), col('Phút cộng dồn', 'carryOverMinutes', 18), col('Phút điều chỉnh', 'adjustmentMinutes', 18),
      col('Phút đã trừ', 'approvedMinutes', 18), col('Phút giữ chỗ', 'pendingMinutes', 18), col('Phút khả dụng', 'availableMinutes', 18), col('Giờ khả dụng', 'availableHours', 18), col('Ngày khả dụng quy đổi', 'availableDays'), col('Ghi chú', 'note', 65)],
      report.data.balances.map(r => ({ ...r, availableHours: Number(r.availableMinutes) / 60, availableDays: Number(r.dayMinutes) > 0 ? Number(r.availableMinutes) / Number(r.dayMinutes) : null,
        note: [r.initialized ? '' : 'Quỹ chưa khởi tạo — số dự kiến theo chính sách, xuất không tự khởi tạo.', Number(r.availableMinutes) < 0 ? 'Số dư âm — cần kiểm tra.' : '', Number(r.pendingMinutes) ? 'Có phút đang giữ chỗ cho đơn chờ duyệt.' : ''].filter(Boolean).join(' ') })));
    sheet(book, 'Điều chỉnh quỹ năm', [...identity, col('Chính sách', 'policyName'), col('Phút tăng/giảm', 'deltaMinutes'), col('Lý do', 'reason', 50), col('Người thao tác', 'actorName'), col('Lúc thao tác (+07)', 'createdAt')], report.data.balanceAdjustments);
  } else if (kind === 'overtime') {
    info.addRow({ label: 'OT được ghi nhận', value: 'Chỉ phút phiếu APPROVED được cộng vào báo cáo OT/bảng công. Check-out trễ không tự sinh OT; đơn chờ/từ chối vẫn có chi tiết, không cộng.' }).height = 42;
    sheet(book, 'Chi tiết OT', [...identity, col('Mã đơn (UUID)', 'id', 38), col('Ngày OT', 'workDate', 16), col('Phút đề nghị', 'requestedMinutes', 18), col('Giờ đề nghị', 'requestedHours', 18), col('Phút OT được ghi nhận', 'approvedMinutes'), col('Lý do', 'reason', 45), col('Công việc OT', 'workContent', 45),
      ...processing, col('Nộp lúc (+07)', 'submittedAt'), col('Ghi chú đối soát', 'note', 65)], requests.map((r, i) => ({ ...r, requestedHours: Number(r.requestedMinutes) / 60, approvedMinutes: details[i].status === 'APPROVED' ? r.requestedMinutes : 0 })));
  } else {
    info.addRow({ label: 'Giải trình và điều chỉnh', value: 'Duyệt giải trình không tự sửa công. Sheet điều chỉnh ghi riêng giá trị cũ/mới, lý do và người sửa; không tự gán quan hệ với đơn giải trình.' }).height = 42;
    sheet(book, 'Chi tiết giải trình', [...identity, col('Mã đơn (UUID)', 'id', 38), col('Ngày', 'workDate', 16), col('Loại vấn đề', 'issueType'), col('Nguồn tạo', 'source'), col('Nội dung yêu cầu', 'requestNote', 45), col('Nội dung nhân viên', 'responseText', 45), col('Có minh chứng', 'evidenceLabel', 18),
      ...processing, col('Tạo lúc (+07)', 'createdAt'), col('Ghi chú đối soát', 'note', 65)], requests.map(r => ({ ...r, evidenceLabel: r.hasEvidence ? 'Có' : 'Không' })));
    sheet(book, 'Điều chỉnh công', [...identity, col('Mã điều chỉnh (UUID)', 'id', 38), col('Ngày công', 'workDate', 16), col('Trường sửa', 'fieldName'), col('Giá trị cũ', 'oldValue', 32), col('Giá trị mới', 'newValue', 32), col('Lý do', 'reason', 50), col('Người thao tác', 'actorName'), col('Lúc thao tác (+07)', 'createdAt')], report.data.adjustments);
  }
  const resource = { leave: 'LEAVE_REQUEST', overtime: 'OVERTIME_REQUEST', explanations: 'ATTENDANCE_EXPLANATION' }[kind];
  sheet(book, 'Lịch sử xử lý', [col('Mã đơn (UUID)', 'requestId', 38), col('Thao tác', 'action'), col('Người thao tác', 'actorName', 30), col('Thời điểm (+07)', 'createdAt')], report.data.audit.filter(r => r.resourceType === resource));
  // Literal strings only, never Excel formulas/hyperlinks derived from user input.
  return Buffer.from(await book.xlsx.writeBuffer());
}
