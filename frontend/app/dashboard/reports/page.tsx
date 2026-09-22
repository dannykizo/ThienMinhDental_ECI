'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest, apiUrl, getAdminSession, type SessionUser } from '@/lib/auth-api';

interface ReportRow { employeeId: string; employeeCode: string; fullName: string; departmentName: string | null; workDate: string; checkedInAt: string | null; checkedOutAt: string | null; status: string; riskFlags: string[]; adjustmentCount: number; }
interface Employee { id: string; employeeCode: string; fullName: string; }
interface Department { id: string; name: string; }
interface AttendancePeriod { id: string | null; periodMonth: string; status: 'OPEN' | 'LOCKED'; lockedAt: string | null; lockedByName: string | null; reopenedAt: string | null; reopenedByName: string | null; reopenReason: string | null; }
const currentMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [period, setPeriod] = useState<AttendancePeriod | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function query(selected = month): string {
    const params = new URLSearchParams({ month: selected });
    if (employeeId) params.set('employeeId', employeeId);
    if (departmentId) params.set('departmentId', departmentId);
    return params.toString();
  }
  async function load(selected = month): Promise<void> {
    const [reportRows, periodState] = await Promise.all([
      apiRequest<ReportRow[]>(`/reporting/monthly?${query(selected)}`),
      apiRequest<AttendancePeriod>(`/reporting/periods/${selected}`),
    ]);
    setRows(reportRows); setPeriod(periodState);
  }
  useEffect(() => {
    Promise.all([apiRequest<ReportRow[]>(`/reporting/monthly?month=${currentMonth}`), apiRequest<AttendancePeriod>(`/reporting/periods/${currentMonth}`), apiRequest<Employee[]>('/employees'), apiRequest<Department[]>('/employees/lookups/departments'), getAdminSession()])
      .then(([reportRows, periodState, employeeRows, departmentRows, user]) => { setRows(reportRows); setPeriod(periodState); setEmployees(employeeRows); setDepartments(departmentRows); setSession(user); })
      .catch(() => setError('Không thể tổng hợp báo cáo tháng.'));
  }, []);

  async function filter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setError(''); setRows(null);
    try { await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo.'); }
  }
  async function lockPeriod(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setError(''); setMessage('');
    try {
      const updated = await apiRequest<AttendancePeriod>(`/reporting/periods/${month}/lock`, { method: 'POST', body: JSON.stringify({ reason: String(form.get('reason') || '').trim() || undefined }) });
      setPeriod(updated); setMessage(`Đã chốt kỳ công ${month}. Mọi điều chỉnh mới đã bị khóa.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể chốt kỳ công.'); }
    finally { setSaving(false); }
  }
  async function reopenPeriod(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setSaving(true); setError(''); setMessage('');
    try {
      const updated = await apiRequest<AttendancePeriod>(`/reporting/periods/${month}/reopen`, { method: 'POST', body: JSON.stringify({ reason: form.get('reason') }) });
      setPeriod(updated); formElement.reset(); setMessage(`Đã mở lại kỳ công ${month}; lý do đã được lưu audit.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể mở lại kỳ công.'); }
    finally { setSaving(false); }
  }

  const blockers = rows?.filter((row) => row.status === 'INCOMPLETE').length ?? 0;
  const canReopen = session?.roles.includes('CHIEF_ACCOUNTANT') ?? false;

  return <div className="module-page">
    <PageHeader eyebrow="C4 / CHỐT KỲ CÔNG" title="Báo cáo & khóa sổ tháng" description="Đối soát dữ liệu, xuất bảng công và khóa kỳ. Chỉ Kế toán trưởng được mở lại kỳ đã chốt." action={blockers === 0 ? <a className="export-link" href={`${apiUrl}/reporting/monthly/export?${query()}`}>Xuất Excel {period?.status === 'LOCKED' ? 'đã chốt' : 'tạm tính'}</a> : <span className="secondary-button disabled-button" aria-disabled="true">Còn dữ liệu cần xử lý</span>} />
    {message && <Notice kind="success">{message}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    {period && <Notice kind={period.status === 'LOCKED' ? 'success' : 'info'}><strong>Kỳ {month}: {period.status === 'LOCKED' ? 'Đã chốt' : 'Đang mở'}.</strong>{period.lockedAt && ` Chốt bởi ${period.lockedByName ?? 'người dùng hệ thống'} lúc ${formatDate(period.lockedAt)}.`}{period.reopenedAt && period.status === 'OPEN' && ` Mở lại bởi ${period.reopenedByName ?? 'Kế toán trưởng'} lúc ${formatDate(period.reopenedAt)}: ${period.reopenReason}.`}</Notice>}
    {rows && blockers > 0 && <Notice kind="error">Còn {blockers} ngày thiếu check-out. Phải xử lý trước khi chốt kỳ công.</Notice>}
    <form className="toolbar" onSubmit={filter}><label>Tháng<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label>Phòng ban<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Tất cả</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nhân viên<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Tất cả</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeCode} · {item.fullName}</option>)}</select></label><button className="secondary-button">Tổng hợp</button></form>
    {period === null ? null : period.status === 'OPEN' ? <details className="editor-panel"><summary>Chốt kỳ công {month}</summary><form className="form-grid compact" onSubmit={lockPeriod}><label>Lý do / ghi chú (không bắt buộc)<input name="reason" minLength={5} placeholder="Ví dụ: Đã hoàn tất đối soát tháng" /></label><button className="primary-button form-action" disabled={saving || blockers > 0}>{saving ? 'Đang xử lý…' : 'Xác nhận chốt kỳ'}</button></form></details> : canReopen ? <details className="editor-panel"><summary>Mở lại kỳ công — chỉ Kế toán trưởng</summary><form className="form-grid compact" onSubmit={reopenPeriod}><label>Lý do mở lại (bắt buộc)<textarea name="reason" minLength={5} required placeholder="Nêu rõ lý do cần điều chỉnh sau chốt…" /></label><button className="primary-button form-action" disabled={saving}>{saving ? 'Đang xử lý…' : 'Mở lại kỳ công'}</button></form></details> : <Notice kind="info">Kỳ đã khóa. Admin cần liên hệ Kế toán trưởng nếu phải điều chỉnh thêm.</Notice>}
    {rows === null ? <LoadingState /> : rows.length === 0 ? <EmptyState title="Chưa có dữ liệu báo cáo" description="Cần phân lịch làm việc cho nhân viên; hệ thống không tự tạo số liệu chấm công." /> : <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Phòng ban</th><th>Vào</th><th>Ra</th><th>Trạng thái</th><th>Cảnh báo / audit</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.employeeId}-${row.workDate}`}><td>{row.workDate}</td><td><strong>{row.employeeCode}</strong><br />{row.fullName}</td><td>{row.departmentName ?? '—'}</td><td>{formatDate(row.checkedInAt)}</td><td>{formatDate(row.checkedOutAt)}</td><td><StatusBadge value={row.status} /></td><td>{row.riskFlags.join(', ') || '—'}{row.adjustmentCount ? ` · ${row.adjustmentCount} điều chỉnh` : ''}</td></tr>)}</tbody></table></div>}
  </div>;
}
