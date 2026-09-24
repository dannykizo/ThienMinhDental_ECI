'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest, apiUrl } from '@/lib/auth-api';

interface DailyRow {
  employeeId: string; employeeCode: string; fullName: string; employeeType: string;
  checkedInAt: string | null; checkedOutAt: string | null; riskFlags: string[]; status: string;
  explanationStatus: string | null; workedMinutes: number; overtimeMinutes: number;
  requiredWorkMinutes: number; isFullWorkday: boolean;
}
interface Adjustment {
  id: string; employeeCode: string; fullName: string; workDate: string; fieldName: string;
  oldValue: unknown; newValue: unknown; reason: string; adjustedByName: string; createdAt: string;
}
interface Explanation {
  id: string; employeeId: string; employeeCode: string; fullName: string; workDate: string;
  issueType: string; requestNote: string; status: string; dueAt: string; responseText: string | null;
  evidenceImageReference: string | null; evidenceCapturedAt: string | null;
  evidenceLatitude: number | null; evidenceLongitude: number | null; reviewNote: string | null; createdAt: string;
}

const today = new Date().toLocaleDateString('en-CA');
const issueLabels: Record<string, string> = {
  MISSING_CHECK_IN: 'Thiếu check-in', MISSING_CHECK_OUT: 'Thiếu check-out', DUPLICATE_ATTEMPT: 'Chấm công trùng',
  WRONG_DATE_OR_DEVICE_TIME: 'Sai ngày / giờ thiết bị', GPS_RISK: 'Rủi ro GPS / ngoài phạm vi', OTHER: 'Khác',
};
function defaultDeadline(): string {
  const value = new Date(); value.setDate(value.getDate() + 1); value.setHours(17, 0, 0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
function evidenceHref(reference: string): string {
  return `${new URL(apiUrl).origin}${reference}`;
}

export default function AttendancePage() {
  const [date, setDate] = useState(today);
  const [view, setView] = useState('ALL');
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(selected = date): Promise<void> {
    const [daily, audit, explanationRows] = await Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${selected}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
      apiRequest<Explanation[]>(`/attendance/explanations?date=${selected}`),
    ]);
    setRows(daily); setAdjustments(audit); setExplanations(explanationRows);
  }
  useEffect(() => {
    Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${today}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
      apiRequest<Explanation[]>(`/attendance/explanations?date=${today}`),
    ]).then(([daily, audit, explanationRows]) => {
      setRows(daily); setAdjustments(audit); setExplanations(explanationRows);
    }).catch(() => setError('Không thể tải dữ liệu chấm công và giải trình.'));
  }, []);

  async function refresh(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setError(''); setRows(null);
    try { await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu.'); }
  }
  async function createExplanation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/attendance/explanations', { method: 'POST', body: JSON.stringify({ employeeId: form.get('employeeId'), workDate: date, issueType: form.get('issueType'), requestNote: form.get('requestNote'), dueAt: new Date(String(form.get('dueAt'))).toISOString() }) });
      formElement.reset(); setSelectedEmployeeId(''); setMessage('Đã gửi yêu cầu giải trình bắt buộc cho nhân viên.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tạo yêu cầu giải trình.'); }
    finally { setSaving(false); }
  }
  async function reviewExplanation(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const reviewNote = status === 'REJECTED' ? window.prompt('Nhập lý do từ chối (bắt buộc, tối thiểu 5 ký tự):') : window.prompt('Ghi chú duyệt (không bắt buộc):');
    if (status === 'REJECTED' && (!reviewNote || reviewNote.trim().length < 5)) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest(`/attendance/explanations/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: reviewNote?.trim() || undefined }) });
      setMessage(status === 'APPROVED' ? 'Đã duyệt giải trình.' : 'Đã từ chối giải trình và lưu lý do.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể duyệt giải trình.'); }
    finally { setSaving(false); }
  }
  async function adjust(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/attendance/adjustments', { method: 'POST', body: JSON.stringify({ employeeId: form.get('employeeId'), workDate: date, fieldName: form.get('fieldName'), newValue: String(form.get('newValue')), reason: form.get('reason') }) });
      formElement.reset(); setMessage('Đã ghi điều chỉnh công và lưu lịch sử audit.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể điều chỉnh chấm công.'); }
    finally { setSaving(false); }
  }

  const metrics = useMemo(() => ({
    total: rows?.length ?? 0,
    attended: rows?.filter((row) => row.checkedInAt || row.checkedOutAt).length ?? 0,
    risks: rows?.filter((row) => row.riskFlags.length > 0).length ?? 0,
    pending: explanations.filter((item) => ['REQUESTED', 'SUBMITTED'].includes(item.status)).length,
  }), [rows, explanations]);
  const visibleRows = rows?.filter((row) => view === 'ALL' || (view === 'ATTENDED' ? Boolean(row.checkedInAt || row.checkedOutAt) : row.riskFlags.length > 0 || row.status === 'CHECKED_IN')) ?? [];

  return <div className="module-page">
    <PageHeader eyebrow="C4 / ĐỐI SOÁT CHẤM CÔNG" title="Chấm công & giải trình" description="Theo dõi người đã chấm công, yêu cầu nhân viên giải trình bất thường và điều chỉnh dữ liệu có lưu vết." />
    {message && <Notice kind="success">{message}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <section className="metric-grid" aria-label="Tổng quan chấm công">
      <article className="metric-card"><p>Nhân sự hoạt động</p><strong>{metrics.total}</strong><span>Trong danh sách theo dõi</span></article>
      <article className="metric-card"><p>Đã chấm công</p><strong>{metrics.attended}</strong><span>Có check-in hoặc check-out</span></article>
      <article className="metric-card"><p>Cần đối soát</p><strong>{metrics.risks}</strong><span>Có cảnh báo vị trí / thời gian</span></article>
      <article className="metric-card"><p>Giải trình đang mở</p><strong>{metrics.pending}</strong><span>Chờ phản hồi hoặc chờ duyệt</span></article>
    </section>
    <form className="toolbar" onSubmit={refresh}><label>Ngày làm việc<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Hiển thị<select value={view} onChange={(event) => setView(event.target.value)}><option value="ALL">Tất cả nhân viên</option><option value="ATTENDED">Đã chấm công</option><option value="REVIEW">Cần đối soát</option></select></label><button className="secondary-button">Tải dữ liệu</button></form>
    {rows === null ? <LoadingState /> : visibleRows.length === 0 ? <EmptyState title="Không có dữ liệu phù hợp" description="Đổi bộ lọc hoặc kiểm tra cấu hình lịch làm việc; hệ thống không tạo số liệu giả." /> : <div className="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Check-in</th><th>Check-out</th><th>Trạng thái</th><th>Công</th><th>Cảnh báo</th><th>Giải trình</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.employeeId}><td><strong>{row.employeeCode}</strong><br />{row.fullName}</td><td>{formatDate(row.checkedInAt)}</td><td>{formatDate(row.checkedOutAt)}</td><td><StatusBadge value={row.status} /></td><td>{row.workedMinutes}/{row.requiredWorkMinutes} phút{row.overtimeMinutes > 0 ? ` · OT ${row.overtimeMinutes}` : ''}</td><td>{row.riskFlags.join(', ') || 'Hợp lệ'}</td><td>{row.explanationStatus ? <StatusBadge value={row.explanationStatus} /> : <button className="table-action" type="button" onClick={() => { setSelectedEmployeeId(row.employeeId); document.getElementById('explanation-editor')?.scrollIntoView({ behavior: 'smooth' }); }}>Yêu cầu giải trình</button>}</td></tr>)}</tbody></table></div>}
    <details className="editor-panel" id="explanation-editor" open={Boolean(selectedEmployeeId)}>
      <summary>Tạo yêu cầu giải trình bắt buộc</summary>
      <form className="form-grid" onSubmit={createExplanation}><label>Nhân viên<select name="employeeId" required value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}><option value="">Chọn nhân viên</option>{rows?.map((row) => <option key={row.employeeId} value={row.employeeId}>{row.employeeCode} · {row.fullName}</option>)}</select></label><label>Vấn đề<select name="issueType" defaultValue="MISSING_CHECK_OUT">{Object.entries(issueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Hạn phản hồi<input name="dueAt" type="datetime-local" defaultValue={defaultDeadline()} required /></label><label className="span-2">Nội dung yêu cầu<textarea name="requestNote" minLength={5} placeholder="Mô tả nội dung nhân viên bắt buộc phải giải trình…" required /></label><button className="primary-button form-action" disabled={saving}>{saving ? 'Đang gửi…' : 'Gửi yêu cầu'}</button></form>
    </details>
    <section className="subsection"><h2>Hàng đợi giải trình ngày {date}</h2>{explanations.length === 0 ? <EmptyState title="Chưa có yêu cầu giải trình" description="Tạo yêu cầu từ dòng nhân viên cần đối soát phía trên." /> : <div className="card-list">{explanations.map((item) => <article className="list-card" key={item.id}><div><p className="mono">{item.employeeCode} · {issueLabels[item.issueType] ?? item.issueType}</p><h3>{item.fullName}</h3><p>{item.requestNote}</p><small>Hạn {formatDate(item.dueAt)}{item.responseText ? ` · Phản hồi: ${item.responseText}` : ''}</small>{item.evidenceImageReference && <p><strong>Bằng chứng:</strong> <a href={evidenceHref(item.evidenceImageReference)} rel="noreferrer" target="_blank">Mở ảnh</a> · {formatDate(item.evidenceCapturedAt)} · {item.evidenceLatitude}, {item.evidenceLongitude}</p>}</div><div><StatusBadge value={item.status} />{item.status === 'SUBMITTED' && <span className="action-group"><button className="table-action success-action" disabled={saving} onClick={() => void reviewExplanation(item.id, 'APPROVED')}>Duyệt</button><button className="table-action danger-action" disabled={saving} onClick={() => void reviewExplanation(item.id, 'REJECTED')}>Từ chối</button></span>}</div></article>)}</div>}</section>
    <details className="editor-panel"><summary>Tạo điều chỉnh chấm công có Audit Log</summary><form className="form-grid" onSubmit={adjust}><label>Nhân viên<select name="employeeId" required><option value="">Chọn nhân viên</option>{rows?.map((row) => <option key={row.employeeId} value={row.employeeId}>{row.employeeCode} · {row.fullName}</option>)}</select></label><label>Trường điều chỉnh<select name="fieldName"><option value="CHECK_IN_TIME">Giờ check-in</option><option value="CHECK_OUT_TIME">Giờ check-out</option><option value="DAY_STATUS">Trạng thái ngày</option></select></label><label>Giá trị mới<input name="newValue" placeholder="ISO datetime hoặc PRESENT" required /></label><label className="span-2">Lý do điều chỉnh<textarea minLength={5} name="reason" required /></label><button className="primary-button form-action" disabled={saving}>Ghi điều chỉnh</button></form></details>
    <section className="subsection"><h2>Lịch sử điều chỉnh (chỉ Admin)</h2>{adjustments.length === 0 ? <p className="muted">Chưa có điều chỉnh nào.</p> : <div className="audit-list">{adjustments.map((item) => <div key={item.id}><strong>{item.employeeCode} · {item.fullName} · {item.workDate} · {item.fieldName}</strong><span>{displayValue(item.oldValue)} → {displayValue(item.newValue)} · {item.reason} · {item.adjustedByName} · {formatDate(item.createdAt)}</span></div>)}</div>}</section>
  </div>;
}
