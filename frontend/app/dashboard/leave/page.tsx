'use client';

import { Plus } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface Employee { id: string; employeeCode: string; fullName: string; }
interface Leave {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  submittedAt: string;
  submittedByName: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
}
interface HistoryItem { id: string; action: string; actorName: string; createdAt: string; }

const leaveTypeMap: Record<string, string> = { ANNUAL: 'Phép năm', SICK: 'Nghỉ bệnh', UNPAID: 'Không lương', OTHER: 'Khác' };

export default function LeavePage() {
  const [items, setItems] = useState<Leave[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [history, setHistory] = useState<{ requestId: string; items: HistoryItem[] } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    const [leaves, people] = await Promise.all([apiRequest<Leave[]>('/leave-requests'), apiRequest<Employee[]>('/employees')]);
    setItems(leaves); setEmployees(people);
  }

  useEffect(() => {
    Promise.all([apiRequest<Leave[]>('/leave-requests'), apiRequest<Employee[]>('/employees')])
      .then(([leaves, people]) => { setItems(leaves); setEmployees(people); })
      .catch(() => setError('Không thể tải đơn nghỉ phép.'));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setSaving(true); setMessage(''); setError('');
    try {
      await apiRequest('/leave-requests', { method: 'POST', body: JSON.stringify({ employeeId: form.get('employeeId'), leaveType: form.get('leaveType'), startDate: form.get('startDate'), endDate: form.get('endDate'), reason: form.get('reason') }) });
      formElement.reset(); setMessage('Đã ghi nhận đơn nghỉ và chuyển sang chờ duyệt.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tạo đơn.'); }
    finally { setSaving(false); }
  }

  async function review(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const reviewNote = status === 'REJECTED' ? window.prompt('Nhập lý do từ chối (bắt buộc, tối thiểu 5 ký tự):') : window.prompt('Ghi chú duyệt (không bắt buộc):');
    if (status === 'REJECTED' && (!reviewNote || reviewNote.trim().length < 5)) return;
    setSaving(true); setMessage(''); setError('');
    try {
      await apiRequest(`/leave-requests/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote: reviewNote?.trim() || undefined }) });
      setMessage(status === 'APPROVED' ? 'Đã duyệt đơn nghỉ; bảng công sẽ nhận diện ngày nghỉ.' : 'Đã từ chối đơn nghỉ và lưu lý do.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xử lý đơn.'); }
    finally { setSaving(false); }
  }

  async function showHistory(id: string): Promise<void> {
    try { setHistory({ requestId: id, items: await apiRequest<HistoryItem[]>(`/leave-requests/${id}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử đơn.'); }
  }

  const metrics = useMemo(() => ({
    all: items?.length ?? 0,
    submitted: items?.filter((item) => item.status === 'SUBMITTED').length ?? 0,
    approved: items?.filter((item) => item.status === 'APPROVED').length ?? 0,
    rejected: items?.filter((item) => item.status === 'REJECTED').length ?? 0,
  }), [items]);
  const visibleItems = items?.filter((item) => statusFilter === 'ALL' || item.status === statusFilter) ?? [];

  return <div className="module-page">
    <PageHeader eyebrow="C6 / NGHỈ PHÉP" title="Đơn nghỉ phép" description="Tiếp nhận, duyệt một cấp và lưu lịch sử xử lý. Chính sách hiện tại chỉ hỗ trợ nghỉ cả ngày theo khoảng ngày." />
    {message && <Notice kind="success">{message}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <Notice kind="info"><strong>Phạm vi đã chốt:</strong> Chưa tính số dư phép, cộng dồn, nghỉ nửa ngày/giờ hoặc hủy đơn đã duyệt. Hệ thống không tự suy diễn các chính sách khách hàng chưa xác nhận.</Notice>

    <section aria-label="Thống kê trạng thái đơn" className="metric-grid">
      {[
        ['ALL', 'Tất cả đơn', metrics.all, 'Hồ sơ đã tiếp nhận'],
        ['SUBMITTED', 'Chờ duyệt', metrics.submitted, 'Cần xử lý trước khi chốt kỳ'],
        ['APPROVED', 'Đã duyệt', metrics.approved, 'Được đưa vào bảng công'],
        ['REJECTED', 'Từ chối', metrics.rejected, 'Có lý do xử lý'],
      ].map(([key, label, value, note]) => <button className="metric-card" key={key} onClick={() => setStatusFilter(String(key))} style={{ cursor: 'pointer', textAlign: 'left', outline: statusFilter === key ? '2px solid var(--brand-primary)' : 'none' }} type="button"><p>{label}</p><strong>{value}</strong><span>{note}</span></button>)}
    </section>

    <details className="editor-panel">
      <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Ghi nhận đơn nghỉ cho nhân viên</span></summary>
      <form className="form-grid" onSubmit={create}>
        <label>Nhân viên<select name="employeeId" required><option value="">Chọn nhân viên</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeCode} · {item.fullName}</option>)}</select></label>
        <label>Loại nghỉ<select name="leaveType"><option value="ANNUAL">Phép năm</option><option value="SICK">Nghỉ bệnh</option><option value="UNPAID">Không lương</option><option value="OTHER">Khác</option></select></label>
        <label>Từ ngày<input name="startDate" required type="date" /></label>
        <label>Đến ngày<input name="endDate" required type="date" /></label>
        <label className="span-2">Lý do xin nghỉ<textarea maxLength={2000} minLength={3} name="reason" placeholder="Nhập lý do cụ thể…" required /></label>
        <button className="primary-button form-action" disabled={saving}>{saving ? 'Đang lưu…' : 'Gửi chờ duyệt'}</button>
      </form>
    </details>

    <div className="toolbar"><label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Tất cả</option><option value="SUBMITTED">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option></select></label></div>
    {items === null ? <LoadingState /> : visibleItems.length === 0 ? <EmptyState title="Chưa có đơn phù hợp" description="Tạo đơn mới hoặc thay đổi bộ lọc trạng thái." /> : <div className="card-list">
      {visibleItems.map((item) => <article className="list-card" key={item.id}>
        <div>
          <p className="mono">{item.employeeCode} · {item.departmentName ?? 'Chưa gán phòng ban'}</p>
          <h3>{item.employeeName}</h3>
          <p><strong>{leaveTypeMap[item.leaveType] ?? item.leaveType}</strong> · {item.startDate} → {item.endDate}</p>
          <p>{item.reason}</p>
          <small>Gửi {formatDate(item.submittedAt)} bởi {item.submittedByName ?? 'dữ liệu trước C6'}</small>
          {item.reviewedAt && <p><strong>{item.reviewedByName ?? 'Người duyệt'}:</strong> {item.reviewNote || 'Không có ghi chú'} · {formatDate(item.reviewedAt)}</p>}
          {history?.requestId === item.id && <div className="trip-history"><strong>Lịch sử thao tác</strong>{history.items.length === 0 ? <small>Chưa có audit cho dữ liệu trước C6.</small> : history.items.map((entry) => <small key={entry.id}>{formatDate(entry.createdAt)} · {entry.actorName} · {entry.action}</small>)}</div>}
        </div>
        <div><StatusBadge value={item.status} /><button className="table-action" onClick={() => void showHistory(item.id)} type="button">Lịch sử</button>{item.status === 'SUBMITTED' && <span className="action-group"><button className="table-action success-action" disabled={saving} onClick={() => void review(item.id, 'APPROVED')} type="button">Duyệt</button><button className="table-action danger-action" disabled={saving} onClick={() => void review(item.id, 'REJECTED')} type="button">Từ chối</button></span>}</div>
      </article>)}
    </div>}
  </div>;
}
