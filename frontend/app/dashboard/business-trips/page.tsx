'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest, apiUrl } from '@/lib/auth-api';

interface TripMember { employeeId: string; employeeCode: string; fullName: string; status: string; startedAt: string | null; completedAt: string | null; note: string | null; evidenceImageReference: string | null; evidenceCapturedAt: string | null; }
interface Trip { id: string; code: string; customerId: string | null; responsibleEmployeeId: string | null; siteName: string; siteAddress: string; startAt: string; endAt: string; content: string; requiresPhoto: boolean; status: string; cancelReason: string | null; customerName: string | null; customerContactName: string | null; customerContactPhone: string | null; responsibleEmployeeName: string | null; memberCount: number; memberNames: string; members: TripMember[]; }
interface Customer { id: string; name: string; address: string; }
interface Employee { id: string; employeeCode: string; fullName: string; isActive: boolean; }
interface AuditItem { id: string; action: string; oldValue: unknown; newValue: unknown; actorName: string; createdAt: string; }

function evidenceHref(reference: string): string {
  return `${new URL(apiUrl).origin}${reference}`;
}

function toLocalInput(value: string): string {
  const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function defaultStart(): string { const value = new Date(); value.setHours(value.getHours() + 1, 0, 0, 0); return toLocalInput(value.toISOString()); }
function defaultEnd(): string { const value = new Date(); value.setHours(value.getHours() + 3, 0, 0, 0); return toLocalInput(value.toISOString()); }

export default function BusinessTripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [history, setHistory] = useState<{ tripId: string; items: AuditItem[] } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    const [tripRows, customerRows, employeeRows] = await Promise.all([apiRequest<Trip[]>('/business-trips'), apiRequest<Customer[]>('/business-trips/lookups/customers'), apiRequest<Employee[]>('/employees')]);
    setTrips(tripRows); setCustomers(customerRows); setEmployees(employeeRows);
  }
  useEffect(() => {
    Promise.all([apiRequest<Trip[]>('/business-trips'), apiRequest<Customer[]>('/business-trips/lookups/customers'), apiRequest<Employee[]>('/employees')])
      .then(([tripRows, customerRows, employeeRows]) => { setTrips(tripRows); setCustomers(customerRows); setEmployees(employeeRows); })
      .catch(() => setError('Không thể tải dữ liệu phiếu công tác.'));
  }, []);

  async function saveTrip(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const memberIds = form.getAll('memberIds');
    const body = { customerId: form.get('customerId') || undefined, responsibleEmployeeId: form.get('responsibleEmployeeId'), siteName: form.get('siteName'), siteAddress: form.get('siteAddress'), startAt: new Date(String(form.get('startAt'))).toISOString(), endAt: new Date(String(form.get('endAt'))).toISOString(), content: form.get('content'), requiresPhoto: form.get('requiresPhoto') === 'on', memberIds };
    setSaving(true); setError(''); setMessage('');
    try {
      if (editing) await apiRequest(`/business-trips/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await apiRequest('/business-trips', { method: 'POST', body: JSON.stringify({ ...body, code: form.get('code') }) });
      setMessage(editing ? 'Đã cập nhật phiếu nháp và lưu audit.' : 'Đã tạo phiếu công tác ở trạng thái nháp.'); setEditing(null); formElement.reset(); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu phiếu công tác.'); }
    finally { setSaving(false); }
  }
  async function transition(id: string, status: 'ASSIGNED' | 'CANCELLED'): Promise<void> {
    const reason = status === 'CANCELLED' ? window.prompt('Nhập lý do hủy phiếu (bắt buộc, tối thiểu 5 ký tự):') : null;
    if (status === 'CANCELLED' && (!reason || reason.trim().length < 5)) return;
    setSaving(true); setError(''); setMessage('');
    try { await apiRequest(`/business-trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason: reason?.trim() || undefined }) }); setMessage(status === 'ASSIGNED' ? 'Đã giao phiếu cho các thành viên.' : 'Đã hủy phiếu và lưu lý do.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể chuyển trạng thái.'); }
    finally { setSaving(false); }
  }
  async function showHistory(tripId: string): Promise<void> {
    try { setHistory({ tripId, items: await apiRequest<AuditItem[]>(`/business-trips/${tripId}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử phiếu.'); }
  }
  async function createCustomer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setSaving(true); setError('');
    try { await apiRequest('/business-trips/lookups/customers', { method: 'POST', body: JSON.stringify({ name: form.get('name'), address: form.get('address'), contactName: form.get('contactName') || undefined, contactPhone: form.get('contactPhone') || undefined }) }); formElement.reset(); setMessage('Đã thêm khách hàng / phòng khám.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể thêm khách hàng.'); }
    finally { setSaving(false); }
  }

  const metrics = useMemo(() => ({ draft: trips?.filter((trip) => trip.status === 'DRAFT').length ?? 0, assigned: trips?.filter((trip) => trip.status === 'ASSIGNED').length ?? 0, active: trips?.filter((trip) => trip.status === 'IN_PROGRESS').length ?? 0, evidence: trips?.filter((trip) => trip.requiresPhoto && trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED').length ?? 0 }), [trips]);
  const visibleTrips = trips?.filter((trip) => statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? !['COMPLETED', 'CANCELLED'].includes(trip.status) : trip.status === statusFilter)) ?? [];
  const activeEmployees = employees.filter((employee) => employee.isActive);

  return <div className="module-page">
    <PageHeader eyebrow="C5 / PHIẾU CÔNG TÁC" title="Điều phối công tác" description="Admin chuẩn bị và giao phiếu; nhân viên được phân công tự bắt đầu, kết thúc và gửi bằng chứng từ ứng dụng." />
    {message && <Notice kind="success">{message}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <section className="metric-grid"><article className="metric-card"><p>Phiếu nháp</p><strong>{metrics.draft}</strong><span>Đang chuẩn bị nội dung</span></article><article className="metric-card"><p>Đã giao</p><strong>{metrics.assigned}</strong><span>Chờ nhân viên bắt đầu</span></article><article className="metric-card"><p>Đang thực hiện</p><strong>{metrics.active}</strong><span>Có thành viên tại hiện trường</span></article><article className="metric-card"><p>Yêu cầu ảnh</p><strong>{metrics.evidence}</strong><span>Cần bằng chứng khi hoàn tất</span></article></section>
    <div className="toolbar"><label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ACTIVE">Đang vận hành</option><option value="ALL">Tất cả</option><option value="DRAFT">Nháp</option><option value="ASSIGNED">Đã giao</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="COMPLETED">Hoàn tất</option><option value="CANCELLED">Đã hủy</option></select></label></div>

    <details className="editor-panel" open><summary>{editing ? `Chỉnh sửa phiếu nháp ${editing.code}` : 'Tạo phiếu công tác'}</summary>
      <form className="form-grid" key={editing?.id ?? 'create'} onSubmit={saveTrip}>
        <label>Mã phiếu<input name="code" defaultValue={editing?.code ?? ''} disabled={Boolean(editing)} required={!editing} placeholder="CT-2026-001" /></label>
        <label>Khách hàng<select name="customerId" defaultValue={editing?.customerId ?? ''}><option value="">Không chọn</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label>Người phụ trách<select name="responsibleEmployeeId" defaultValue={editing?.responsibleEmployeeId ?? ''} required><option value="">Chọn người phụ trách</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label>
        <label>Tên địa điểm<input name="siteName" defaultValue={editing?.siteName ?? ''} required /></label><label className="span-2">Địa chỉ<input name="siteAddress" defaultValue={editing?.siteAddress ?? ''} required /></label>
        <label>Bắt đầu<input name="startAt" type="datetime-local" defaultValue={editing ? toLocalInput(editing.startAt) : defaultStart()} required /></label><label>Kết thúc<input name="endAt" type="datetime-local" defaultValue={editing ? toLocalInput(editing.endAt) : defaultEnd()} required /></label>
        <label className="span-2">Nội dung công việc<textarea name="content" defaultValue={editing?.content ?? ''} required /></label>
        <fieldset className="span-2 check-list"><legend>Thành viên — người phụ trách phải được chọn ở đây</legend>{activeEmployees.map((employee) => <label key={employee.id}><input name="memberIds" type="checkbox" value={employee.id} defaultChecked={editing?.members.some((member) => member.employeeId === employee.id)} />{employee.employeeCode} · {employee.fullName}</label>)}</fieldset>
        <label className="check-inline"><input name="requiresPhoto" type="checkbox" defaultChecked={editing?.requiresPhoto} />Bắt buộc ảnh hiện trường khi hoàn tất</label>
        <span className="action-group"><button className="primary-button form-action" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo phiếu nháp'}</button>{editing && <button className="secondary-button" type="button" onClick={() => setEditing(null)}>Hủy chỉnh sửa</button>}</span>
      </form>
    </details>
    <details className="editor-panel"><summary>Thêm khách hàng / phòng khám</summary><form className="inline-form customer-form" onSubmit={createCustomer}><input name="name" placeholder="Tên khách hàng" required /><input name="address" placeholder="Địa chỉ" required /><input name="contactName" placeholder="Người liên hệ" /><input name="contactPhone" placeholder="Điện thoại" /><button className="secondary-button" disabled={saving}>Thêm khách hàng</button></form></details>

    {trips === null ? <LoadingState /> : visibleTrips.length === 0 ? <EmptyState title="Chưa có phiếu phù hợp" description="Tạo phiếu nháp mới hoặc thay đổi bộ lọc trạng thái." /> : <div className="card-list">{visibleTrips.map((trip) => <article className="list-card trip-card" key={trip.id}><div><p className="mono">{trip.code} · {trip.customerName ?? 'Không gắn khách hàng'}</p><h3>{trip.siteName}</h3><p>{trip.siteAddress}</p><p>{trip.content}</p><small>{formatDate(trip.startAt)} → {formatDate(trip.endAt)} · Phụ trách: {trip.responsibleEmployeeName ?? 'Chưa xác định'}{trip.requiresPhoto ? ' · Bắt buộc ảnh' : ''}</small><div className="trip-member-list">{trip.members.map((member) => <span key={member.employeeId}><strong>{member.fullName}</strong> <StatusBadge value={member.status} />{member.evidenceImageReference ? <> · <a href={evidenceHref(member.evidenceImageReference)} rel="noreferrer" target="_blank">Mở ảnh</a></> : ''}</span>)}</div>{trip.cancelReason && <p><strong>Lý do hủy:</strong> {trip.cancelReason}</p>}{history?.tripId === trip.id && <div className="trip-history"><strong>Lịch sử thao tác</strong>{history.items.map((item) => <small key={item.id}>{formatDate(item.createdAt)} · {item.actorName} · {item.action}</small>)}</div>}</div><div><StatusBadge value={trip.status} /><button className="table-action" onClick={() => void showHistory(trip.id)}>Lịch sử</button>{trip.status === 'DRAFT' && <><button className="table-action" onClick={() => { setEditing(trip); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Chỉnh sửa</button><button className="table-action success-action" disabled={saving} onClick={() => void transition(trip.id, 'ASSIGNED')}>Giao phiếu</button></>}{!['COMPLETED', 'CANCELLED'].includes(trip.status) && <button className="table-action danger-action" disabled={saving} onClick={() => void transition(trip.id, 'CANCELLED')}>Hủy phiếu</button>}</div></article>)}</div>}
  </div>;
}
