'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest, getAdminSession, type SessionUser } from '@/lib/auth-api';

interface Department { id: string; name: string; }
interface Employee { id: string; employeeCode: string; fullName: string; }
interface Announcement {
  id: string;
  title: string;
  body: string;
  status: string;
  audienceType: 'ALL' | 'DEPARTMENT' | 'EMPLOYEE';
  departmentId?: string | null;
  employeeId?: string | null;
  targetName?: string | null;
  requiresAcknowledgement: boolean;
  createdAt?: string;
  publishedAt?: string | null;
  withdrawnAt?: string | null;
  withdrawReason?: string | null;
  createdByName?: string;
  recipientCount: number;
  readCount: number;
  acknowledgedCount: number;
}
interface Recipient { employeeId: string; employeeCode: string; employeeName: string; departmentName: string | null; deliveredAt: string | null; readAt: string | null; acknowledgedAt: string | null; }
interface HistoryItem { id: string; action: string; actorName: string; createdAt: string; }

const audienceLabels: Record<string, string> = { ALL: 'Toàn bộ nhân viên (dữ liệu cũ)', DEPARTMENT: 'Phòng ban', EMPLOYEE: 'Cá nhân' };

export default function AnnouncementsPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [audienceType, setAudienceType] = useState<'DEPARTMENT' | 'EMPLOYEE'>('DEPARTMENT');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [recipientState, setRecipientState] = useState<{ announcementId: string; items: Recipient[] } | null>(null);
  const [history, setHistory] = useState<{ announcementId: string; items: HistoryItem[] } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = session?.roles.includes('ADMIN') ?? false;

  async function load(currentSession = session): Promise<void> {
    if (!currentSession) return;
    const announcements = await apiRequest<Announcement[]>(currentSession.roles.includes('ADMIN') ? '/announcements' : '/announcements/managed');
    setItems(announcements);
  }

  useEffect(() => {
    getAdminSession().then(async (currentUser) => {
      const admin = currentUser.roles.includes('ADMIN');
      const [announcements, departmentRows, employeeRows] = await Promise.all([
        apiRequest<Announcement[]>(admin ? '/announcements' : '/announcements/managed'),
        admin ? apiRequest<Department[]>('/employees/lookups/departments') : Promise.resolve([]),
        admin ? apiRequest<Employee[]>('/employees') : Promise.resolve([]),
      ]);
      setSession(currentUser); setItems(announcements); setDepartments(departmentRows); setEmployees(employeeRows);
    }).catch(() => setError('Không thể tải thông báo nội bộ.'));
  }, []);

  async function saveDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setSaving(true); setMessage(''); setError('');
    const payload = {
      title: form.get('title'), body: form.get('body'), audienceType,
      departmentId: audienceType === 'DEPARTMENT' ? form.get('departmentId') : undefined,
      employeeId: audienceType === 'EMPLOYEE' ? form.get('employeeId') : undefined,
      requiresAcknowledgement: form.get('requiresAcknowledgement') === 'on',
    };
    try {
      await apiRequest(editing ? `/announcements/${editing.id}` : '/announcements', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      formElement.reset(); setEditing(null); setAudienceType('DEPARTMENT'); setMessage(editing ? 'Đã cập nhật bản nháp.' : 'Đã lưu thông báo nháp.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu thông báo.'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, status: 'PUBLISHED' | 'CANCELLED' | 'WITHDRAWN'): Promise<void> {
    const reason = status === 'WITHDRAWN' ? window.prompt('Ghi chú thu hồi (không bắt buộc):') : null;
    setSaving(true); setMessage(''); setError('');
    try {
      await apiRequest(`/announcements/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason: reason?.trim() || undefined }) });
      setMessage(status === 'PUBLISHED' ? 'Đã xuất bản và chốt danh sách người nhận.' : status === 'WITHDRAWN' ? 'Đã thu hồi thông báo khỏi danh sách nhân viên.' : 'Đã hủy bản nháp.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể cập nhật trạng thái.'); }
    finally { setSaving(false); }
  }

  async function showRecipients(id: string): Promise<void> {
    try { setRecipientState({ announcementId: id, items: await apiRequest<Recipient[]>(`/announcements/${id}/recipients`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải trạng thái người nhận.'); }
  }

  async function showHistory(id: string): Promise<void> {
    try { setHistory({ announcementId: id, items: await apiRequest<HistoryItem[]>(`/announcements/${id}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử thông báo.'); }
  }

  function beginEdit(item: Announcement): void {
    setEditing(item); setAudienceType(item.audienceType === 'EMPLOYEE' ? 'EMPLOYEE' : 'DEPARTMENT'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const metrics = useMemo(() => ({
    draft: items?.filter((item) => item.status === 'DRAFT').length ?? 0,
    published: items?.filter((item) => item.status === 'PUBLISHED').length ?? 0,
    awaiting: items?.reduce((total, item) => total + (item.status === 'PUBLISHED' && item.requiresAcknowledgement ? item.recipientCount - item.acknowledgedCount : 0), 0) ?? 0,
    withdrawn: items?.filter((item) => item.status === 'WITHDRAWN').length ?? 0,
  }), [items]);
  const visibleItems = items?.filter((item) => statusFilter === 'ALL' || item.status === statusFilter) ?? [];

  return <div className="module-page">
    <PageHeader eyebrow="C7 / THÔNG BÁO NỘI BỘ" title={isAdmin ? 'Thông báo nội bộ' : 'Theo dõi xác nhận thông báo'} description={isAdmin ? 'Admin soạn bản nháp, chọn cá nhân hoặc phòng ban, xuất bản và theo dõi trạng thái đọc.' : 'Theo dõi nhân viên được phân công trực tiếp cho bạn; không hiển thị dữ liệu ngoài phạm vi quản lý.'} />
    {message && <Notice kind="success">{message}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <Notice kind="info"><strong>Phạm vi C7:</strong> Tin quan trọng yêu cầu nhân viên xác nhận riêng. Hộp thư Mobile đã hoạt động; gửi push thật cần cấu hình Firebase trên môi trường triển khai. File/ảnh, hẹn giờ đăng, mức khẩn cấp và thời hạn hiển thị chưa được triển khai.</Notice>

    <section className="metric-grid" aria-label="Tổng quan thông báo">
      <article className="metric-card"><p>Bản nháp</p><strong>{metrics.draft}</strong><span>Chưa gửi tới nhân viên</span></article>
      <article className="metric-card"><p>Đang phát hành</p><strong>{metrics.published}</strong><span>Nội dung đang khả dụng</span></article>
      <article className="metric-card"><p>Chờ xác nhận</p><strong>{metrics.awaiting}</strong><span>Chỉ tính tin quan trọng</span></article>
      <article className="metric-card"><p>Đã thu hồi</p><strong>{metrics.withdrawn}</strong><span>Không còn trong danh sách nhân viên</span></article>
    </section>

    {isAdmin && <details className="editor-panel" open={Boolean(editing)}>
      <summary>{editing ? `Chỉnh sửa bản nháp · ${editing.title}` : '+ Soạn thông báo mới'}</summary>
      <form className="form-grid" key={editing?.id ?? 'new'} onSubmit={saveDraft}>
        <label className="span-2">Tiêu đề<input defaultValue={editing?.title ?? ''} maxLength={200} minLength={3} name="title" required /></label>
        <label>Đối tượng<select name="audienceType" value={audienceType} onChange={(event) => setAudienceType(event.target.value as 'DEPARTMENT' | 'EMPLOYEE')}><option value="DEPARTMENT">Theo phòng ban</option><option value="EMPLOYEE">Theo cá nhân</option></select></label>
        {audienceType === 'DEPARTMENT' ? <label>Phòng ban<select defaultValue={editing?.departmentId ?? ''} name="departmentId" required><option value="">Chọn phòng ban</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <label>Nhân viên<select defaultValue={editing?.employeeId ?? ''} name="employeeId" required><option value="">Chọn nhân viên</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeCode} · {item.fullName}</option>)}</select></label>}
        <label className="span-2">Nội dung<textarea defaultValue={editing?.body ?? ''} maxLength={10000} minLength={3} name="body" required rows={5} /></label>
        <label className="check-inline span-2"><input defaultChecked={editing?.requiresAcknowledgement ?? false} name="requiresAcknowledgement" type="checkbox" /> Tin quan trọng — bắt buộc nhân viên xác nhận đã đọc</label>
        <button className="primary-button form-action" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Cập nhật bản nháp' : 'Lưu bản nháp'}</button>
        {editing && <button className="secondary-button form-action" onClick={() => { setEditing(null); setAudienceType('DEPARTMENT'); }} type="button">Hủy chỉnh sửa</button>}
      </form>
    </details>}

    <div className="toolbar"><label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Tất cả</option>{isAdmin && <option value="DRAFT">Bản nháp</option>}<option value="PUBLISHED">Đang phát hành</option><option value="WITHDRAWN">Đã thu hồi</option>{isAdmin && <option value="CANCELLED">Đã hủy</option>}</select></label></div>

    {items === null ? <LoadingState /> : visibleItems.length === 0 ? <EmptyState title="Chưa có thông báo phù hợp" description={isAdmin ? 'Soạn bản nháp mới hoặc thay đổi bộ lọc.' : 'Chưa có thông báo cho nhân viên thuộc phạm vi quản lý.'} /> : <div className="card-list">{visibleItems.map((item) => {
      const recipients = recipientState?.announcementId === item.id ? recipientState.items : null;
      return <article className="list-card announcement-card" key={item.id}><div>
        <p className="mono">{audienceLabels[item.audienceType] ?? item.audienceType}{item.targetName ? ` · ${item.targetName}` : ''} · {formatDate(item.publishedAt ?? item.createdAt)}</p>
        <h3>{item.title}</h3><p>{item.body}</p>
        <small>{item.requiresAcknowledgement ? 'Tin quan trọng · ' : ''}{item.recipientCount} người nhận · {item.readCount} đã đọc{item.requiresAcknowledgement ? ` · ${item.acknowledgedCount} đã xác nhận` : ''}</small>
        {item.withdrawnAt && <p><strong>Thu hồi {formatDate(item.withdrawnAt)}:</strong> {item.withdrawReason || 'Không có ghi chú'}</p>}
        {recipients && <div className="trip-history"><strong>Trạng thái người nhận</strong>{recipients.length === 0 ? <small>Không có nhân viên thuộc phạm vi bạn quản lý.</small> : recipients.map((recipient) => <small key={recipient.employeeId}>{recipient.employeeCode} · {recipient.employeeName} · {recipient.departmentName ?? 'Chưa gán phòng'} · {item.requiresAcknowledgement ? recipient.acknowledgedAt ? `Đã xác nhận ${formatDate(recipient.acknowledgedAt)}` : recipient.readAt ? 'Đã đọc, chưa xác nhận' : 'Chưa đọc' : recipient.readAt ? `Đã đọc ${formatDate(recipient.readAt)}` : 'Chưa đọc'}</small>)}</div>}
        {history?.announcementId === item.id && <div className="trip-history"><strong>Lịch sử quản trị</strong>{history.items.map((entry) => <small key={entry.id}>{formatDate(entry.createdAt)} · {entry.actorName} · {entry.action}</small>)}</div>}
      </div><div><StatusBadge value={item.status} />{item.status !== 'DRAFT' && <button className="table-action" onClick={() => void showRecipients(item.id)} type="button">Người nhận</button>}{isAdmin && <>{item.status === 'DRAFT' && <><button className="table-action" onClick={() => beginEdit(item)} type="button">Chỉnh sửa</button><button className="table-action success-action" disabled={saving} onClick={() => void transition(item.id, 'PUBLISHED')} type="button">Xuất bản</button><button className="table-action danger-action" disabled={saving} onClick={() => void transition(item.id, 'CANCELLED')} type="button">Hủy nháp</button></>}{item.status === 'PUBLISHED' && <button className="table-action danger-action" disabled={saving} onClick={() => void transition(item.id, 'WITHDRAWN')} type="button">Thu hồi</button>}<button className="table-action" onClick={() => void showHistory(item.id)} type="button">Lịch sử</button></>}</div></article>;
    })}</div>}
  </div>;
}
