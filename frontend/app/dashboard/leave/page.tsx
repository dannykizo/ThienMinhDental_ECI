'use client';

import { CalendarClock, Plus, Settings2, WalletCards } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, Pagination, StatusBadge, ToastNotice, formatDate } from '@/components/admin-ui';
import { apiRequest, getAdminSession, type SessionUser } from '@/lib/auth-api';
import { useActionDialog } from '@/components/use-action-dialog';
import { useClientPagination } from '@/lib/use-client-pagination';
import { EmployeePicker, type EmployeePickerOption } from '@/components/employee-picker';

type Employee = EmployeePickerOption;
interface LeavePolicy {
  id: string; code: string; name: string; isActive: boolean; balanceTrackingEnabled: boolean;
  annualEntitlementMinutes: number; dayMinutes: number; carryOverEnabled: boolean;
  maxCarryOverMinutes: number; allowHalfDay: boolean; allowHourly: boolean;
  allowApprovedCancellation: boolean; minimumNoticeDays: number;
}
interface LeaveBalance {
  employeeId: string; employeeCode: string; employeeName: string; departmentName: string | null;
  policyId: string; policyCode: string; policyName: string; dayMinutes: number; initialized: boolean;
  entitlementMinutes: number; carryOverMinutes: number; adjustmentMinutes: number;
  approvedMinutes: number; pendingMinutes: number; availableMinutes: number;
}
interface Leave {
  id: string; employeeId: string; employeeCode: string; employeeName: string; departmentName: string | null;
  policyId: string; policyName: string; leaveType: string; durationType: 'FULL_DAY' | 'HALF_DAY' | 'HOURS';
  halfDayPeriod: 'AM' | 'PM' | null; startTime: string | null; endTime: string | null;
  requestedMinutes: number; dayMinutes: number; startDate: string; endDate: string; reason: string;
  status: string; submittedAt: string; submittedByName: string | null; reviewNote: string | null;
  reviewedAt: string | null; reviewedByName: string | null; cancelledAt: string | null;
  cancellationReason: string | null;
}
interface HistoryItem { id: string; action: string; actorName: string; createdAt: string; }

type DurationType = Leave['durationType'];

const currentYear = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

function durationLabel(item: Leave): string {
  if (item.durationType === 'HALF_DAY') return `Nửa ngày ${item.halfDayPeriod === 'AM' ? 'buổi sáng' : 'buổi chiều'}`;
  if (item.durationType === 'HOURS') return `${item.startTime?.slice(0, 5)}–${item.endTime?.slice(0, 5)}`;
  return item.startDate === item.endDate ? 'Cả ngày' : 'Nhiều ngày';
}

function minutesLabel(minutes: number, dayMinutes = 480): string {
  if (minutes === 0) return '0 ngày';
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  const days = absolute / dayMinutes;
  return Number.isInteger(days) ? `${sign}${days} ngày` : `${sign}${days.toFixed(2)} ngày (${absolute} phút)`;
}

export default function LeavePage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<Leave[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceYear, setBalanceYear] = useState(currentYear);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [durationType, setDurationType] = useState<DurationType>('FULL_DAY');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [history, setHistory] = useState<{ requestId: string; items: HistoryItem[] } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { request: requestAction, dialog: actionDialog } = useActionDialog();

  const isAdmin = session?.roles.includes('ADMIN') ?? false;
  const activePolicies = policies.filter((policy) => policy.isActive);
  const selectedPolicy = activePolicies.find((policy) => policy.id === selectedPolicyId);

  async function load(currentSession = session, year = balanceYear): Promise<void> {
    if (!currentSession) return;
    const [leaves, people, policyRows, balanceRows] = await Promise.all([
      apiRequest<Leave[]>('/leave-requests'),
      apiRequest<Employee[]>('/employees'),
      apiRequest<LeavePolicy[]>('/leave-requests/policies'),
      currentSession.roles.includes('ADMIN') ? apiRequest<LeaveBalance[]>(`/leave-requests/balances?year=${year}`) : Promise.resolve([]),
    ]);
    setItems(leaves); setEmployees(people); setPolicies(policyRows); setBalances(balanceRows);
    setSelectedPolicyId((current) => policyRows.some((policy) => policy.id === current && policy.isActive) ? current : (policyRows.find((policy) => policy.isActive)?.id ?? ''));
  }

  useEffect(() => {
    getAdminSession().then(async (currentUser) => {
      setSession(currentUser);
      await load(currentUser, currentYear);
    }).catch(() => setError('Không thể tải dữ liệu nghỉ phép.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setSaving(true); setMessage(''); setError('');
    try {
      await apiRequest('/leave-requests', { method: 'POST', body: JSON.stringify({
        employeeId: selectedEmployeeId, policyId: selectedPolicyId, durationType,
        startDate, endDate: durationType === 'FULL_DAY' ? endDate : startDate,
        halfDayPeriod: durationType === 'HALF_DAY' ? form.get('halfDayPeriod') : undefined,
        startTime: durationType === 'HOURS' ? form.get('startTime') : undefined,
        endTime: durationType === 'HOURS' ? form.get('endTime') : undefined,
        reason: form.get('reason'),
      }) });
      formElement.reset(); setSelectedEmployeeId(''); setDurationType('FULL_DAY'); setStartDate(today); setEndDate(today);
      setMessage('Đã ghi nhận đơn nghỉ và giữ trước số dư (nếu chính sách có theo dõi).'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tạo đơn.'); }
    finally { setSaving(false); }
  }

  async function cancel(item: Leave): Promise<void> {
    const reason = await requestAction({ title: 'Hủy đơn nghỉ', description: 'Đơn sẽ chuyển sang trạng thái đã hủy và phần số dư đang giữ/đã dùng sẽ được hoàn lại theo chính sách.', confirmLabel: 'Xác nhận hủy', fieldLabel: 'Lý do hủy', required: true, minLength: 5, danger: true });
    if (reason === null) return;
    await runAction(async () => {
      await apiRequest(`/leave-requests/${item.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setMessage('Đã hủy đơn và hoàn lại phần số dư đã giữ/đã dùng.');
    });
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const dayMinutes = Number(form.get('dayMinutes'));
    const payload = {
      ...(!editingPolicy ? { code: String(form.get('code')).trim().toUpperCase() } : {}),
      ...(editingPolicy ? { isActive: form.get('isActive') === 'on' } : {}),
      name: form.get('name'),
      balanceTrackingEnabled: form.get('balanceTrackingEnabled') === 'on', dayMinutes,
      annualEntitlementMinutes: Math.round(Number(form.get('annualEntitlementDays')) * dayMinutes),
      carryOverEnabled: form.get('carryOverEnabled') === 'on',
      maxCarryOverMinutes: Math.round(Number(form.get('maxCarryOverDays')) * dayMinutes),
      allowHalfDay: form.get('allowHalfDay') === 'on', allowHourly: form.get('allowHourly') === 'on',
      allowApprovedCancellation: form.get('allowApprovedCancellation') === 'on',
      minimumNoticeDays: Number(form.get('minimumNoticeDays')),
    };
    await runAction(async () => {
      await apiRequest(editingPolicy ? `/leave-requests/policies/${editingPolicy.id}` : '/leave-requests/policies', {
        method: editingPolicy ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      setEditingPolicy(null); setMessage(editingPolicy ? 'Đã cập nhật chính sách nghỉ.' : 'Đã tạo chính sách nghỉ mới.');
    });
  }

  async function initializeBalances(): Promise<void> {
    await runAction(async () => {
      const result = await apiRequest<{ created: number }>('/leave-requests/balances/initialize', { method: 'POST', body: JSON.stringify({ year: balanceYear }) });
      setMessage(`Đã khởi tạo ${result.created} số dư cho năm ${balanceYear}.`);
    });
  }

  async function adjustBalance(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const balance = balances.find((item) => `${item.employeeId}:${item.policyId}` === form.get('balanceKey'));
    if (!balance) return;
    const deltaMinutes = Math.round(Number(form.get('deltaDays')) * balance.dayMinutes);
    await runAction(async () => {
      await apiRequest('/leave-requests/balances/adjust', { method: 'POST', body: JSON.stringify({ employeeId: balance.employeeId, policyId: balance.policyId, year: balanceYear, deltaMinutes, reason: form.get('reason') }) });
      formElement.reset(); setMessage('Đã điều chỉnh số dư và ghi audit log.');
    });
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    setSaving(true); setMessage(''); setError('');
    try { await action(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác.'); }
    finally { setSaving(false); }
  }

  async function changeBalanceYear(year: number): Promise<void> {
    setBalanceYear(year); setError('');
    if (!isAdmin) return;
    try { setBalances(await apiRequest<LeaveBalance[]>(`/leave-requests/balances?year=${year}`)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải số dư phép.'); }
  }

  async function showHistory(id: string): Promise<void> {
    try { setHistory({ requestId: id, items: await apiRequest<HistoryItem[]>(`/leave-requests/${id}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử đơn.'); }
  }

  const metrics = useMemo(() => ({
    all: items?.length ?? 0, submitted: items?.filter((item) => item.status === 'SUBMITTED').length ?? 0,
    approved: items?.filter((item) => item.status === 'APPROVED').length ?? 0,
    cancelled: items?.filter((item) => item.status === 'CANCELLED').length ?? 0,
  }), [items]);
  const visibleItems = items?.filter((item) => statusFilter === 'ALL' || item.status === statusFilter) ?? [];
  const itemPaging = useClientPagination(visibleItems, 20);

  return <div className="module-page">
    {actionDialog}
    <PageHeader eyebrow="CR6 / CHÍNH SÁCH NGHỈ PHÉP" title="Nghỉ phép và số dư" description="Admin cấu hình chính sách/quỹ phép. Đơn nghỉ chuyển Leader xác nhận → Trưởng phòng duyệt tại Xử lý nghỉ phép." />
    {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}{error && <Notice kind="error">{error}</Notice>}
    <Notice kind="info"><strong>Quy tắc an toàn:</strong> Đơn chờ duyệt giữ trước số dư; từ chối hoặc hủy sẽ tự giải phóng. Chính sách cũ mặc định chưa trừ quỹ phép cho đến khi Admin chủ động bật.</Notice>

    <section aria-label="Thống kê trạng thái đơn" className="metric-grid">
      {[
        ['ALL', 'Tất cả đơn', metrics.all, 'Hồ sơ đã tiếp nhận'], ['SUBMITTED', 'Chờ duyệt', metrics.submitted, 'Đang giữ trước số dư'],
        ['APPROVED', 'Đã duyệt', metrics.approved, 'Đã tính vào quỹ phép'], ['CANCELLED', 'Đã hủy', metrics.cancelled, 'Số dư đã được hoàn lại'],
      ].map(([key, label, value, note]) => <button className="metric-card" key={key} onClick={() => { setStatusFilter(String(key)); itemPaging.setPage(1); }} style={{ cursor: 'pointer', textAlign: 'left', outline: statusFilter === key ? '2px solid var(--brand-primary)' : 'none' }} type="button"><p>{label}</p><strong>{value}</strong><span>{note}</span></button>)}
    </section>

    {isAdmin && <details className="editor-panel" open={Boolean(editingPolicy)}>
      <summary><span className="summary-label"><Settings2 aria-hidden="true" size={16} />Cấu hình chính sách nghỉ phép</span></summary>
      <div className="card-list" style={{ marginBottom: 20 }}>{policies.map((policy) => <article className="list-card" key={policy.id}><div><p className="mono">{policy.code}</p><h3>{policy.name}</h3><p>{policy.balanceTrackingEnabled ? `${minutesLabel(policy.annualEntitlementMinutes, policy.dayMinutes)}/năm` : 'Không theo dõi số dư'} · {policy.allowHalfDay ? 'Nửa ngày' : 'Cả ngày'}{policy.allowHourly ? ' · Theo giờ' : ''}</p><small>{policy.minimumNoticeDays > 0 ? `Báo trước ${policy.minimumNoticeDays} ngày` : 'Không yêu cầu báo trước'} · {policy.carryOverEnabled ? `Cộng dồn tối đa ${minutesLabel(policy.maxCarryOverMinutes, policy.dayMinutes)}` : 'Không cộng dồn'} · {policy.isActive ? 'Đang dùng' : 'Đã ngừng'}</small></div><div><StatusBadge value={policy.isActive ? 'ACTIVE' : 'INACTIVE'} /><button className="table-action" onClick={() => setEditingPolicy(policy)} type="button">Chỉnh sửa</button></div></article>)}</div>
      <form className="form-grid" key={editingPolicy?.id ?? 'new-policy'} onSubmit={savePolicy}>
        {!editingPolicy && <label>Mã chính sách<input maxLength={30} name="code" pattern="[A-Z][A-Z0-9_]{1,29}" placeholder="PHEP_NAM" required /></label>}
        <label>Tên chính sách<input defaultValue={editingPolicy?.name} maxLength={120} minLength={2} name="name" required /></label>
        <label>Phút/ngày<input defaultValue={editingPolicy?.dayMinutes ?? 480} max={1440} min={1} name="dayMinutes" required type="number" /></label>
        <label>Định mức (ngày/năm)<input defaultValue={editingPolicy ? editingPolicy.annualEntitlementMinutes / editingPolicy.dayMinutes : 12} min={0} name="annualEntitlementDays" required step="0.25" type="number" /></label>
        <label>Cộng dồn tối đa (ngày)<input defaultValue={editingPolicy ? editingPolicy.maxCarryOverMinutes / editingPolicy.dayMinutes : 0} min={0} name="maxCarryOverDays" required step="0.25" type="number" /></label>
        <label>Số ngày phải báo trước<input defaultValue={editingPolicy?.minimumNoticeDays ?? 0} max={365} min={0} name="minimumNoticeDays" required type="number" /></label>
        <label className="check-inline"><input defaultChecked={editingPolicy?.isActive ?? true} name="isActive" type="checkbox" />Đang áp dụng</label>
        <label className="check-inline"><input defaultChecked={editingPolicy?.balanceTrackingEnabled} name="balanceTrackingEnabled" type="checkbox" />Theo dõi số dư</label>
        <label className="check-inline"><input defaultChecked={editingPolicy?.carryOverEnabled} name="carryOverEnabled" type="checkbox" />Cho phép cộng dồn</label>
        <label className="check-inline"><input defaultChecked={editingPolicy?.allowHalfDay} name="allowHalfDay" type="checkbox" />Cho phép nửa ngày</label>
        <label className="check-inline"><input defaultChecked={editingPolicy?.allowHourly} name="allowHourly" type="checkbox" />Cho phép theo giờ</label>
        <label className="check-inline"><input defaultChecked={editingPolicy?.allowApprovedCancellation} name="allowApprovedCancellation" type="checkbox" />Cho hủy đơn đã duyệt</label>
        <div className="form-action action-group"><button className="primary-button" disabled={saving}>{saving ? 'Đang lưu…' : editingPolicy ? 'Lưu chính sách' : 'Tạo chính sách'}</button>{editingPolicy && <button className="secondary-button" onClick={() => setEditingPolicy(null)} type="button">Hủy sửa</button>}</div>
      </form>
    </details>}

    {isAdmin && <details className="editor-panel">
      <summary><span className="summary-label"><WalletCards aria-hidden="true" size={16} />Số dư phép nhân viên</span></summary>
      <div className="toolbar"><label>Năm<input max={2200} min={2000} onChange={(event) => void changeBalanceYear(Number(event.target.value))} type="number" value={balanceYear} /></label><button className="secondary-button" disabled={saving} onClick={() => void initializeBalances()} type="button">Khởi tạo số dư năm</button></div>
      {balances.length === 0 ? <EmptyState title="Chưa có chính sách theo dõi số dư" description="Bật theo dõi số dư ở một chính sách, sau đó khởi tạo số dư cho năm vận hành." /> : <div className="card-list">{balances.map((balance) => <article className="list-card" key={`${balance.employeeId}:${balance.policyId}`}><div><p className="mono">{balance.employeeCode} · {balance.departmentName ?? 'Chưa gán phòng ban'}</p><h3>{balance.employeeName} · {balance.policyName}</h3><p>Còn <strong>{minutesLabel(balance.availableMinutes, balance.dayMinutes)}</strong> · Đã duyệt {minutesLabel(balance.approvedMinutes, balance.dayMinutes)} · Đang giữ {minutesLabel(balance.pendingMinutes, balance.dayMinutes)}</p><small>Định mức {minutesLabel(balance.entitlementMinutes, balance.dayMinutes)} · Cộng dồn {minutesLabel(balance.carryOverMinutes, balance.dayMinutes)} · Điều chỉnh {minutesLabel(balance.adjustmentMinutes, balance.dayMinutes)}{!balance.initialized ? ' · Chưa khởi tạo chính thức' : ''}</small></div></article>)}</div>}
      {balances.length > 0 && <form className="form-grid compact" onSubmit={adjustBalance}><label>Nhân viên · chính sách<select name="balanceKey" required><option value="">Chọn số dư</option>{balances.map((balance) => <option key={`${balance.employeeId}:${balance.policyId}`} value={`${balance.employeeId}:${balance.policyId}`}>{balance.employeeCode} · {balance.employeeName} · {balance.policyName}</option>)}</select></label><label>Số ngày điều chỉnh<input name="deltaDays" placeholder="Ví dụ: 1 hoặc -0.5" required step="0.25" type="number" /></label><label className="span-2">Lý do điều chỉnh<textarea minLength={5} name="reason" placeholder="Bắt buộc ghi lý do để lưu audit…" required /></label><button className="primary-button form-action" disabled={saving}>Ghi điều chỉnh</button></form>}
    </details>}

    <details className="editor-panel">
      <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Ghi nhận đơn nghỉ cho nhân viên</span></summary>
      <form className="form-grid" onSubmit={create}>
        <EmployeePicker employees={employees.filter((employee) => employee.isActive !== false)} onChange={setSelectedEmployeeId} value={selectedEmployeeId} />
        <label>Chính sách<select required value={selectedPolicyId} onChange={(event) => { setSelectedPolicyId(event.target.value); setDurationType('FULL_DAY'); }}><option value="">Chọn chính sách</option>{activePolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
        <label>Hình thức<select value={durationType} onChange={(event) => setDurationType(event.target.value as DurationType)}><option value="FULL_DAY">Cả ngày / nhiều ngày</option>{selectedPolicy?.allowHalfDay && <option value="HALF_DAY">Nửa ngày</option>}{selectedPolicy?.allowHourly && <option value="HOURS">Theo giờ</option>}</select></label>
        <label>Từ ngày<input onChange={(event) => { setStartDate(event.target.value); if (durationType !== 'FULL_DAY') setEndDate(event.target.value); }} required type="date" value={startDate} /></label>
        {durationType === 'FULL_DAY' && <label>Đến ngày<input min={startDate} onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} /></label>}
        {durationType === 'HALF_DAY' && <label>Buổi nghỉ<select name="halfDayPeriod"><option value="AM">Buổi sáng</option><option value="PM">Buổi chiều</option></select></label>}
        {durationType === 'HOURS' && <><label>Từ giờ<input name="startTime" required type="time" /></label><label>Đến giờ<input name="endTime" required type="time" /></label></>}
        <label className="span-2">Lý do xin nghỉ<textarea maxLength={2000} minLength={3} name="reason" placeholder="Nhập lý do cụ thể…" required /></label>
        <button className="primary-button form-action" disabled={saving || !selectedPolicyId}>{saving ? 'Đang lưu…' : 'Gửi chờ duyệt'}</button>
      </form>
    </details>

    <div className="toolbar"><label>Trạng thái<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); itemPaging.setPage(1); }}><option value="ALL">Tất cả</option><option value="SUBMITTED">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option><option value="CANCELLED">Đã hủy</option></select></label></div>
    {items === null ? <LoadingState /> : visibleItems.length === 0 ? <EmptyState title="Chưa có đơn phù hợp" description="Tạo đơn mới hoặc thay đổi bộ lọc trạng thái." /> : <><div className="card-list">
      {itemPaging.items.map((item) => {
        const policy = policies.find((candidate) => candidate.id === item.policyId);
        const canCancel = item.status === 'SUBMITTED' || (item.status === 'APPROVED' && policy?.allowApprovedCancellation);
        return <article className="list-card" key={item.id}><div>
          <p className="mono">{item.employeeCode} · {item.departmentName ?? 'Chưa gán phòng ban'}</p>
          <h3>{item.employeeName}</h3>
          <p><strong>{item.policyName}</strong> · {item.startDate}{item.endDate !== item.startDate ? ` → ${item.endDate}` : ''} · {durationLabel(item)} · {minutesLabel(item.requestedMinutes, item.dayMinutes)}</p>
          <p>{item.reason}</p><small>Gửi {formatDate(item.submittedAt)} bởi {item.submittedByName ?? 'dữ liệu cũ'}</small>
          {item.reviewedAt && <p><strong>{item.reviewedByName ?? 'Người duyệt'}:</strong> {item.reviewNote || 'Không có ghi chú'} · {formatDate(item.reviewedAt)}</p>}
          {item.cancelledAt && <p><strong>Lý do hủy:</strong> {item.cancellationReason} · {formatDate(item.cancelledAt)}</p>}
          {history?.requestId === item.id && <div className="trip-history"><strong>Lịch sử thao tác</strong>{history.items.map((entry) => <small key={entry.id}>{formatDate(entry.createdAt)} · {entry.actorName} · {entry.action}</small>)}</div>}
        </div><div><StatusBadge value={item.status} /><button className="table-action" onClick={() => void showHistory(item.id)} type="button">Lịch sử</button>{item.status === 'SUBMITTED' && <a className="table-action" href="/dashboard/leave-workflow">Theo dõi / phân tuyến hai bước</a>}{canCancel && <button className="table-action danger-action" disabled={saving} onClick={() => void cancel(item)} type="button">Hủy đơn</button>}</div></article>;
      })}
    </div><Pagination page={itemPaging.page} pageSize={itemPaging.pageSize} total={visibleItems.length} onPageChange={itemPaging.setPage} /></>}
    <p className="block-note"><CalendarClock aria-hidden="true" size={15} /> Thời lượng cả ngày ưu tiên lịch làm việc đã gán; nếu chưa có lịch, hệ thống dùng số phút/ngày của chính sách.</p>
  </div>;
}
