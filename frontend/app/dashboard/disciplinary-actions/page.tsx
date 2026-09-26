'use client';

import { FileWarning, Pencil, Plus, RotateCcw, Send } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  formatDate,
} from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

type ActionType = 'WARNING' | 'SUSPENSION' | 'DISCIPLINARY_ACTION';
type ActionStatus = 'DRAFT' | 'ISSUED' | 'REVOKED';

interface Employee {
  employeeCode: string;
  fullName: string;
  id: string;
  isActive: boolean;
}

interface DisciplinaryAction {
  actionType: ActionType;
  announcementId: string | null;
  createdAt: string;
  createdByName: string;
  decision: string;
  departmentName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  employeeCode: string;
  employeeId: string;
  employeeName: string;
  id: string;
  issuedAt: string | null;
  issuedByName: string | null;
  reason: string;
  revocationReason: string | null;
  revokedAt: string | null;
  status: ActionStatus;
  title: string;
}

interface HistoryItem {
  action: string;
  actorName: string;
  createdAt: string;
  id: string;
}

const actionLabels: Record<ActionType, string> = {
  WARNING: 'Cảnh cáo',
  SUSPENSION: 'Đình chỉ',
  DISCIPLINARY_ACTION: 'Xử lý vi phạm',
};

function today(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export default function DisciplinaryActionsPage() {
  const [items, setItems] = useState<DisciplinaryAction[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<DisciplinaryAction | null>(null);
  const [actionType, setActionType] = useState<ActionType>('WARNING');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [history, setHistory] = useState<{ id: string; items: HistoryItem[] } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    const [actions, employeeRows] = await Promise.all([
      apiRequest<DisciplinaryAction[]>('/disciplinary-actions'),
      apiRequest<Employee[]>('/employees'),
    ]);
    setItems(actions);
    setEmployees(employeeRows);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<DisciplinaryAction[]>('/disciplinary-actions'),
      apiRequest<Employee[]>('/employees'),
    ])
      .then(([actions, employeeRows]) => {
        setItems(actions);
        setEmployees(employeeRows);
      })
      .catch(() => setError('Không thể tải hồ sơ cảnh cáo và đình chỉ.'));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true); setMessage(''); setError('');
    const payload = {
      actionType,
      decision: form.get('decision'),
      effectiveFrom: form.get('effectiveFrom'),
      effectiveTo: actionType === 'SUSPENSION' ? form.get('effectiveTo') : undefined,
      employeeId: form.get('employeeId'),
      reason: form.get('reason'),
      title: form.get('title'),
    };
    try {
      await apiRequest(editing ? `/disciplinary-actions/${editing.id}` : '/disciplinary-actions', {
        body: JSON.stringify(payload),
        method: editing ? 'PATCH' : 'POST',
      });
      formElement.reset(); setEditing(null); setActionType('WARNING');
      setMessage(editing ? 'Đã cập nhật quyết định nháp.' : 'Đã tạo quyết định nháp.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu quyết định.');
    } finally { setSaving(false); }
  }

  async function issue(item: DisciplinaryAction): Promise<void> {
    if (!window.confirm(`Ban hành “${item.title}” và gửi thông báo bắt buộc xác nhận tới ${item.employeeName}?`)) return;
    setSaving(true); setMessage(''); setError('');
    try {
      await apiRequest(`/disciplinary-actions/${item.id}/issue`, { method: 'POST' });
      setMessage('Đã ban hành quyết định và chuyển vào Hộp thư của nhân viên. Push đã được xử lý theo cấu hình hiện tại.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể ban hành quyết định.');
    } finally { setSaving(false); }
  }

  async function revoke(item: DisciplinaryAction): Promise<void> {
    const reason = window.prompt('Nhập lý do thu hồi quyết định (tối thiểu 5 ký tự):');
    if (!reason) return;
    setSaving(true); setMessage(''); setError('');
    try {
      await apiRequest(`/disciplinary-actions/${item.id}/revoke`, {
        body: JSON.stringify({ reason: reason.trim() }),
        method: 'POST',
      });
      setMessage('Đã thu hồi quyết định và thông báo cho nhân viên nếu tài khoản còn hoạt động.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể thu hồi quyết định.');
    } finally { setSaving(false); }
  }

  async function showHistory(id: string): Promise<void> {
    try {
      setHistory({ id, items: await apiRequest<HistoryItem[]>(`/disciplinary-actions/${id}/history`) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử quyết định.');
    }
  }

  function beginEdit(item: DisciplinaryAction): void {
    setEditing(item); setActionType(item.actionType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const metrics = useMemo(() => ({
    draft: items?.filter((item) => item.status === 'DRAFT').length ?? 0,
    issued: items?.filter((item) => item.status === 'ISSUED').length ?? 0,
    suspension: items?.filter((item) => item.status === 'ISSUED' && item.actionType === 'SUSPENSION').length ?? 0,
    revoked: items?.filter((item) => item.status === 'REVOKED').length ?? 0,
  }), [items]);
  const visibleItems = items?.filter((item) => statusFilter === 'ALL' || item.status === statusFilter) ?? [];

  return <div className="module-page">
    <PageHeader eyebrow="CR5 / KỶ LUẬT NHÂN SỰ" title="Cảnh cáo, đình chỉ và xử lý vi phạm" description="Lập quyết định, ban hành có audit và gửi thông báo bắt buộc xác nhận tới nhân viên." />
    {message && <Notice kind="success">{message}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <Notice kind="info"><strong>Nguyên tắc vận hành:</strong> Ban hành quyết định sẽ tạo ngay một thông báo cá nhân trong Hộp thư và thử gửi push. CR5 không tự trừ lương, sửa bảng công hoặc khóa tài khoản; các hệ quả đó cần chính sách riêng được phê duyệt.</Notice>

    <section className="metric-grid" aria-label="Tổng quan xử lý vi phạm">
      <article className="metric-card"><p>Bản nháp</p><strong>{metrics.draft}</strong><span>Chưa gửi nhân viên</span></article>
      <article className="metric-card"><p>Đã ban hành</p><strong>{metrics.issued}</strong><span>Đang có hiệu lực hồ sơ</span></article>
      <article className="metric-card"><p>Đình chỉ</p><strong>{metrics.suspension}</strong><span>Quyết định đình chỉ đã ban hành</span></article>
      <article className="metric-card"><p>Đã thu hồi</p><strong>{metrics.revoked}</strong><span>Vẫn giữ đầy đủ lịch sử</span></article>
    </section>

    <details className="editor-panel" open={Boolean(editing)}>
      <summary><span className="summary-label">{editing ? <Pencil aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}{editing ? `Chỉnh sửa · ${editing.title}` : 'Lập quyết định mới'}</span></summary>
      <form className="form-grid" key={editing?.id ?? 'new'} onSubmit={save}>
        <label>Nhân viên<select defaultValue={editing?.employeeId ?? ''} name="employeeId" required><option value="">Chọn nhân viên</option>{employees.filter((employee) => employee.isActive || employee.id === editing?.employeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label>
        <label>Hình thức<select value={actionType} onChange={(event) => setActionType(event.target.value as ActionType)}><option value="WARNING">Cảnh cáo</option><option value="SUSPENSION">Đình chỉ</option><option value="DISCIPLINARY_ACTION">Xử lý vi phạm</option></select></label>
        <label>Ngày hiệu lực<input defaultValue={editing?.effectiveFrom ?? today()} name="effectiveFrom" required type="date" /></label>
        {actionType === 'SUSPENSION' && <label>Đình chỉ đến hết ngày<input defaultValue={editing?.effectiveTo ?? ''} min={editing?.effectiveFrom ?? today()} name="effectiveTo" required type="date" /></label>}
        <label className="span-2">Tiêu đề quyết định<input defaultValue={editing?.title ?? ''} maxLength={200} minLength={3} name="title" required /></label>
        <label className="span-2">Lý do / hành vi vi phạm<textarea defaultValue={editing?.reason ?? ''} maxLength={5000} minLength={5} name="reason" required rows={4} /></label>
        <label className="span-2">Nội dung xử lý<textarea defaultValue={editing?.decision ?? ''} maxLength={5000} minLength={3} name="decision" required rows={4} /></label>
        <button className="primary-button form-action" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Cập nhật bản nháp' : 'Lưu bản nháp'}</button>
        {editing && <button className="secondary-button form-action" onClick={() => { setEditing(null); setActionType('WARNING'); }} type="button">Hủy chỉnh sửa</button>}
      </form>
    </details>

    <div className="toolbar"><label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Tất cả</option><option value="DRAFT">Bản nháp</option><option value="ISSUED">Đã ban hành</option><option value="REVOKED">Đã thu hồi</option></select></label></div>

    {items === null ? <LoadingState /> : visibleItems.length === 0 ? <EmptyState title="Chưa có quyết định phù hợp" description="Lập bản nháp mới hoặc thay đổi bộ lọc trạng thái." /> : <div className="card-list">{visibleItems.map((item) => <article className="list-card announcement-card" key={item.id}><div>
      <p className="mono">{actionLabels[item.actionType]} · {item.employeeCode} · {item.employeeName} · {item.departmentName ?? 'Chưa gán phòng ban'}</p>
      <h3>{item.title}</h3>
      <p><strong>Lý do:</strong> {item.reason}</p><p><strong>Xử lý:</strong> {item.decision}</p>
      <small>Hiệu lực {item.effectiveFrom}{item.effectiveTo ? ` – ${item.effectiveTo}` : ''}{item.issuedAt ? ` · Ban hành ${formatDate(item.issuedAt)}` : ` · Tạo ${formatDate(item.createdAt)}`}</small>
      {item.announcementId && <small className="block-note"><FileWarning aria-hidden="true" size={14} /> Đã tạo thông báo cá nhân bắt buộc xác nhận</small>}
      {item.revocationReason && <p><strong>Thu hồi:</strong> {item.revocationReason} · {formatDate(item.revokedAt)}</p>}
      {history?.id === item.id && <div className="trip-history"><strong>Lịch sử bất biến</strong>{history.items.map((entry) => <small key={entry.id}>{formatDate(entry.createdAt)} · {entry.actorName} · {entry.action}</small>)}</div>}
    </div><div><StatusBadge value={item.status} />{item.status === 'DRAFT' && <><button className="table-action" onClick={() => beginEdit(item)} type="button"><Pencil aria-hidden="true" size={13} /> Chỉnh sửa</button><button className="table-action success-action" disabled={saving} onClick={() => void issue(item)} type="button"><Send aria-hidden="true" size={13} /> Ban hành</button></>}{item.status === 'ISSUED' && <button className="table-action danger-action" disabled={saving} onClick={() => void revoke(item)} type="button"><RotateCcw aria-hidden="true" size={13} /> Thu hồi</button>}<button className="table-action" onClick={() => void showHistory(item.id)} type="button">Lịch sử</button></div></article>)}</div>}
  </div>;
}
