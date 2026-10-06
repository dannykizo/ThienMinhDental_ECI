'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, ToastNotice, formatDate } from '@/components/admin-ui';
import { apiRequest, apiUrl } from '@/lib/auth-api';
import { useActionDialog } from '@/components/use-action-dialog';

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
  issueType: string; source: 'EMPLOYEE' | 'ADMIN_REQUEST'; requestNote: string; status: string; dueAt: string | null; responseText: string | null;
  evidenceImageReference: string | null; evidenceCapturedAt: string | null;
  evidenceLatitude: number | null; evidenceLongitude: number | null; reviewNote: string | null; createdAt: string;
}

const today = new Date().toLocaleDateString('en-CA');
const issueLabels: Record<string, string> = {
  MISSING_CHECK_IN: 'Thiếu check-in', MISSING_CHECK_OUT: 'Thiếu check-out', DUPLICATE_ATTEMPT: 'Chấm công trùng',
  WRONG_DATE_OR_DEVICE_TIME: 'Sai ngày / giờ thiết bị', GPS_RISK: 'Rủi ro GPS / ngoài phạm vi', OTHER: 'Khác',
};
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
  const [explanationFilter, setExplanationFilter] = useState('SUBMITTED');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const { request: requestAction, dialog: actionDialog } = useActionDialog();

  async function load(selected = date): Promise<void> {
    const [daily, audit, explanationRows] = await Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${selected}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
      apiRequest<Explanation[]>('/attendance/explanations'),
    ]);
    setRows(daily); setAdjustments(audit); setExplanations(explanationRows);
  }
  useEffect(() => {
    Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${today}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
      apiRequest<Explanation[]>('/attendance/explanations'),
    ]).then(([daily, audit, explanationRows]) => {
      setRows(daily); setAdjustments(audit); setExplanations(explanationRows);
    }).catch(() => setError('Không thể tải dữ liệu chấm công và giải trình.'));
  }, []);

  async function refresh(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setError(''); setRows(null);
    try { await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu.'); }
  }
  async function reviewExplanation(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const reviewNote = await requestAction({
      title: status === 'APPROVED' ? 'Duyệt giải trình' : 'Từ chối giải trình',
      description: status === 'APPROVED' ? 'Xác nhận nội dung giải trình hợp lệ. Duyệt đơn không tự điều chỉnh giờ công.' : 'Bạn có thể ghi lý do để nhân viên hiểu quyết định. Lý do không bắt buộc.',
      confirmLabel: status === 'APPROVED' ? 'Xác nhận duyệt' : 'Từ chối',
      fieldLabel: status === 'APPROVED' ? 'Ghi chú duyệt (không bắt buộc)' : 'Lý do từ chối (không bắt buộc)',
      required: false, danger: status === 'REJECTED',
    });
    if (reviewNote === null) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest(`/attendance/explanations/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: reviewNote?.trim() || undefined }) });
      setMessage(status === 'APPROVED' ? 'Đã duyệt giải trình. Bảng công không tự thay đổi.' : 'Đã từ chối giải trình.'); await load();
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
  const visibleExplanations = explanations.filter((item) => explanationFilter === 'ALL' || item.status === explanationFilter);

  return <div className="module-page">
    {actionDialog}
    <PageHeader eyebrow="ĐỐI SOÁT CHẤM CÔNG" title="Chấm công & giải trình" description="Tiếp nhận đơn do nhân viên chủ động gửi, xem minh chứng và phê duyệt. Điều chỉnh công là thao tác riêng có lưu vết." />
    {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}{error && <Notice kind="error">{error}</Notice>}
    <section className="metric-grid" aria-label="Tổng quan chấm công">
      <article className="metric-card"><p>Nhân sự hoạt động</p><strong>{metrics.total}</strong><span>Trong danh sách theo dõi</span></article>
      <article className="metric-card"><p>Đã chấm công</p><strong>{metrics.attended}</strong><span>Có check-in hoặc check-out</span></article>
      <article className="metric-card"><p>Cần đối soát</p><strong>{metrics.risks}</strong><span>Có cảnh báo vị trí / thời gian</span></article>
      <article className="metric-card"><p>Giải trình đang mở</p><strong>{metrics.pending}</strong><span>Mọi ngày · gồm yêu cầu cũ chưa phản hồi</span></article>
    </section>
    <form className="toolbar" onSubmit={refresh}><label>Ngày làm việc<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Hiển thị<select value={view} onChange={(event) => setView(event.target.value)}><option value="ALL">Tất cả nhân viên</option><option value="ATTENDED">Đã chấm công</option><option value="REVIEW">Cần đối soát</option></select></label><button className="secondary-button">Tải dữ liệu</button></form>
    {rows === null ? <LoadingState /> : visibleRows.length === 0 ? <EmptyState title="Không có dữ liệu phù hợp" description="Đổi bộ lọc hoặc kiểm tra cấu hình lịch làm việc; hệ thống không tạo số liệu giả." /> : <div className="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Check-in</th><th>Check-out</th><th>Trạng thái</th><th>Công</th><th>Cảnh báo</th><th>Giải trình</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.employeeId}><td><strong>{row.employeeCode}</strong><br />{row.fullName}</td><td>{formatDate(row.checkedInAt)}</td><td>{formatDate(row.checkedOutAt)}</td><td><StatusBadge value={row.status} /></td><td>{row.workedMinutes}/{row.requiredWorkMinutes} phút{row.overtimeMinutes > 0 ? ` · OT ${row.overtimeMinutes}` : ''}</td><td>{row.riskFlags.join(', ') || 'Hợp lệ'}</td><td>{row.explanationStatus ? <StatusBadge value={row.explanationStatus} /> : 'Chưa có đơn'}</td></tr>)}</tbody></table></div>}
    <section className="subsection">
      <h2>Đơn giải trình · mọi ngày</h2>
      <p className="muted">Nhân viên tạo đơn trên app. Duyệt giải trình không tự sửa giờ công.</p>
      <label>Trạng thái <select value={explanationFilter} onChange={(event) => setExplanationFilter(event.target.value)}><option value="SUBMITTED">Chờ duyệt</option><option value="ALL">Tất cả</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option><option value="REQUESTED">Yêu cầu cũ chờ phản hồi</option></select></label>
      {rows === null && !error ? <LoadingState /> : visibleExplanations.length === 0 ? <EmptyState title="Chưa có đơn phù hợp" description="Chọn trạng thái khác hoặc tải lại để nhận đơn mới từ nhân viên." /> : <div className="card-list">{visibleExplanations.map((item) => <article className="list-card" key={item.id}>
        <div><p className="mono">{item.employeeCode} · {issueLabels[item.issueType] ?? item.issueType}</p><h3>{item.fullName}</h3>
          <small>Ngày xảy ra: {item.workDate} · Gửi: {formatDate(item.createdAt)} · {item.source === 'EMPLOYEE' ? 'Nhân viên chủ động gửi' : 'Yêu cầu cũ từ Admin'}</small>
          {item.requestNote && <p>Yêu cầu cũ: {item.requestNote}</p>}
          {item.dueAt && <small>Hạn phản hồi yêu cầu cũ: {formatDate(item.dueAt)}</small>}
          {item.responseText && <p style={{ whiteSpace: 'pre-wrap' }}>{item.responseText}</p>}
          {item.evidenceImageReference ? <p><strong>Minh chứng:</strong> <a href={evidenceHref(item.evidenceImageReference)} rel="noreferrer" target="_blank">Mở ảnh</a>{item.evidenceCapturedAt && <> · Chụp: {formatDate(item.evidenceCapturedAt)}</>}{item.evidenceLatitude != null && item.evidenceLongitude != null && <> · {item.evidenceLatitude}, {item.evidenceLongitude}</>}</p> : <p className="muted">Không đính kèm minh chứng.</p>}
          {item.reviewNote && <p>Ghi chú xử lý: {item.reviewNote}</p>}
        </div><div><StatusBadge value={item.status} />{item.status === 'SUBMITTED' && <span className="action-group"><button className="table-action success-action" disabled={saving} onClick={() => void reviewExplanation(item.id, 'APPROVED')}>Duyệt</button><button className="table-action danger-action" disabled={saving} onClick={() => void reviewExplanation(item.id, 'REJECTED')}>Từ chối</button></span>}</div>
      </article>)}</div>}
    </section>
    <details className="editor-panel"><summary>Tạo điều chỉnh chấm công có Audit Log</summary><form className="form-grid" onSubmit={adjust}><label>Nhân viên<select name="employeeId" required><option value="">Chọn nhân viên</option>{rows?.map((row) => <option key={row.employeeId} value={row.employeeId}>{row.employeeCode} · {row.fullName}</option>)}</select></label><label>Trường điều chỉnh<select name="fieldName"><option value="CHECK_IN_TIME">Giờ check-in</option><option value="CHECK_OUT_TIME">Giờ check-out</option><option value="DAY_STATUS">Trạng thái ngày</option></select></label><label>Giá trị mới<input name="newValue" placeholder="ISO datetime hoặc PRESENT" required /></label><label className="span-2">Lý do điều chỉnh<textarea minLength={5} name="reason" required /></label><button className="primary-button form-action" disabled={saving}>Ghi điều chỉnh</button></form></details>
    <section className="subsection"><h2>Lịch sử điều chỉnh (chỉ Admin)</h2>{adjustments.length === 0 ? <p className="muted">Chưa có điều chỉnh nào.</p> : <div className="audit-list">{adjustments.map((item) => <div key={item.id}><strong>{item.employeeCode} · {item.fullName} · {item.workDate} · {item.fieldName}</strong><span>{displayValue(item.oldValue)} → {displayValue(item.newValue)} · {item.reason} · {item.adjustedByName} · {formatDate(item.createdAt)}</span></div>)}</div>}</section>
  </div>;
}
