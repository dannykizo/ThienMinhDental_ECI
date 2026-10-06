'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, Pagination, StatusBadge, ToastNotice, formatDate } from '@/components/admin-ui';
import { EmployeePicker } from '@/components/employee-picker';
import { useActionDialog } from '@/components/use-action-dialog';
import { apiRequest, apiUrl, getAdminSession } from '@/lib/auth-api';

interface Explanation {
  id: string; employeeId: string; employeeCode: string; fullName: string; workDate: string; issueType: string; status: string; source: string; requestNote: string; dueAt: string | null;
  responseText: string | null; evidenceImageReference: string | null; createdAt: string; approvalStage: string | null; routeVersion: number;
  workflowTeamId: string | null; workflowDepartmentId: string | null; leaderUserId: string | null; headUserId: string | null; teamName: string | null; departmentName: string | null;
  leaderName: string | null; headName: string | null; confirmedBy: string | null; confirmedByName: string | null; confirmedAt: string | null;
  confirmationNote: string | null; reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null;
  canConfirm: boolean; canReview: boolean; canReroute: boolean; routingRequired: boolean;
}
interface Route { employeeId: string; employeeCode: string; fullName: string; teamId: string; teamName: string; leaderUserId: string; leaderName: string; headUserId: string; headName: string; version: number; }
interface Member { employeeId: string; userId: string; employeeCode: string; fullName: string; teamId: string; teamName: string; departmentId: string; departmentName: string; }
interface Grant { userId: string; employeeId: string; name: string; roleCode: string; teamId: string | null; departmentId: string; }
interface Options { members: Member[]; grants: Grant[]; }
interface Audit { id: string; action: string; actorName: string; createdAt: string; oldValue: unknown; newValue: unknown; }
const stageLabels: Record<string, string> = { EMPLOYEE_RESPONSE: 'Chờ nhân viên phản hồi yêu cầu cũ', WAITING_ROUTING: 'Chờ Admin phân tuyến', LEADER_CONFIRMATION: 'Bước 1 · Chờ Leader xác nhận', HEAD_APPROVAL: 'Bước 2 · Chờ Trưởng phòng duyệt', COMPLETED: 'Đã xử lý hai bước' };
const issueLabels: Record<string, string> = { MISSING_CHECK_IN: 'Thiếu check-in', MISSING_CHECK_OUT: 'Thiếu check-out', DUPLICATE_ATTEMPT: 'Chấm công trùng', WRONG_DATE_OR_DEVICE_TIME: 'Sai ngày / giờ thiết bị', GPS_RISK: 'Rủi ro GPS', OTHER: 'Khác' };

export function ExplanationsWorkspace({ onChanged }: { onChanged?: () => Promise<void> }) {
  const [items, setItems] = useState<Explanation[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [options, setOptions] = useState<Options>({ members: [], grants: [] });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filter, setFilter] = useState('OPEN'); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState(''); const [teamId, setTeamId] = useState(''); const [leaderId, setLeaderId] = useState(''); const [headId, setHeadId] = useState(''); const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<Explanation | null>(null);
  const [history, setHistory] = useState<{ id: string; entries: Audit[] } | null>(null);
  const { request, dialog } = useActionDialog();

  async function load(): Promise<void> {
    const session = await getAdminSession();
    const isAdmin = session.roles.includes('ADMIN');
    const [rows, choices, defaults] = await Promise.all([
      apiRequest<Explanation[]>('/attendance/explanations'),
      isAdmin ? apiRequest<Options>('/attendance/explanations/routing-options') : Promise.resolve({ members: [], grants: [] }),
      isAdmin ? apiRequest<Route[]>('/attendance/explanations/routes') : Promise.resolve([]),
    ]);
    setItems(rows); setAdmin(isAdmin); setOptions(choices); setRoutes(defaults);
  }
  useEffect(() => { let cancelled = false;
    async function initial(): Promise<void> {
      try {
        const session = await getAdminSession(); const isAdmin = session.roles.includes('ADMIN');
        const [rows, choices, defaults] = await Promise.all([apiRequest<Explanation[]>('/attendance/explanations'), isAdmin ? apiRequest<Options>('/attendance/explanations/routing-options') : Promise.resolve({ members: [], grants: [] }), isAdmin ? apiRequest<Route[]>('/attendance/explanations/routes') : Promise.resolve([])]);
        if (!cancelled) { setItems(rows); setAdmin(isAdmin); setOptions(choices); setRoutes(defaults); }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Không tải được giải trình.'); }
    }
    void initial(); return () => { cancelled = true; };
  }, []);
  async function refresh(): Promise<void> {
    if (busy) return; setBusy(true); setError('');
    try { await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải lại.'); } finally { setBusy(false); }
  }
  function selectEmployee(id: string): void {
    setEditing(null); setEmployeeId(id); const route = routes.find((r) => r.employeeId === id);
    setTeamId(route?.teamId ?? ''); setLeaderId(route?.leaderUserId ?? ''); setHeadId(route?.headUserId ?? ''); setReason('');
  }
  function editItem(item: Explanation): void {
    setEditing(item); setEmployeeId(item.employeeId); setTeamId(item.workflowTeamId ?? ''); setLeaderId(item.leaderUserId ?? ''); setHeadId(item.headUserId ?? ''); setReason('');
    document.getElementById('explanation-routing-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveRoute(event: FormEvent): Promise<void> {
    event.preventDefault(); if (busy) return;
    const confirmation = await request({ title: editing ? 'Đổi tuyến đơn giải trình' : 'Lưu tuyến mặc định', description: editing ? 'Áp dụng ngay cho bước chưa xử lý. Bước đã xác nhận và lịch sử không bị sửa.' : 'Áp dụng cho đơn mới và cập nhật ngay các đơn đang chờ của nhân viên. Các bước đã xác nhận giữ nguyên team/Leader; Trưởng phòng mới phải đủ quyền tại phạm vi cũ.', confirmLabel: 'Lưu và áp dụng ngay' });
    if (confirmation === null) return;
    setBusy(true); setError(''); setMessage('');
    const selected = routes.find((r) => r.employeeId === employeeId);
    try {
      await apiRequest(editing ? `/attendance/explanations/${editing.id}/reroute` : `/attendance/explanations/routes/${employeeId}`, { method: editing ? 'PATCH' : 'PUT', body: JSON.stringify({ teamId, leaderUserId: leaderId, headUserId: headId, reason, expectedVersion: editing?.routeVersion ?? selected?.version ?? 0 }) });
      setMessage('Đã lưu tuyến và áp dụng cho bước chưa xử lý, có audit.'); setEditing(null); setEmployeeId(''); setTeamId(''); setLeaderId(''); setHeadId(''); setReason('');
      await load(); await onChanged?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu tuyến.'); } finally { setBusy(false); }
  }
  async function process(item: Explanation, action: 'CONFIRM' | 'APPROVED' | 'REJECTED'): Promise<void> {
    if (busy) return;
    const note = await request({ title: action === 'CONFIRM' ? 'Leader xác nhận giải trình' : action === 'APPROVED' ? 'Trưởng phòng duyệt giải trình' : 'Trưởng phòng từ chối giải trình', description: action === 'CONFIRM' ? 'Xác nhận bước 1 và chuyển cho Trưởng phòng. Đây chưa phải quyết định phê duyệt.' : 'Quyết định kết thúc đơn và thông báo cho nhân viên. Duyệt không tự sửa giờ công.', confirmLabel: action === 'CONFIRM' ? 'Xác nhận và chuyển bước 2' : action === 'APPROVED' ? 'Duyệt' : 'Từ chối', fieldLabel: 'Ghi chú / lý do (không bắt buộc)', required: false, danger: action === 'REJECTED' });
    if (note === null) return; setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest(`/attendance/explanations/${item.id}/${action === 'CONFIRM' ? 'confirm' : 'review'}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: item.routeVersion, ...(action === 'CONFIRM' ? { confirmationNote: note } : { status: action, reviewNote: note }) }) });
      setMessage(action === 'CONFIRM' ? 'Đã xác nhận; chuyển Trưởng phòng duyệt.' : 'Đã ghi quyết định và gửi thông báo vào hộp thư nhân viên.'); await load(); await onChanged?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xử lý đơn.'); } finally { setBusy(false); }
  }
  async function showHistory(item: Explanation): Promise<void> {
    if (busy) return; setBusy(true); setError(''); setHistory(null);
    try { setHistory({ id: item.id, entries: await apiRequest<Audit[]>(`/attendance/explanations/${item.id}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không tải được audit.'); } finally { setBusy(false); }
  }
  const employees = [...new Map(options.members.map((m) => [m.employeeId, { id: m.employeeId, employeeCode: m.employeeCode, fullName: m.fullName, organizationAssignments: options.members.filter((other) => other.employeeId === m.employeeId).map((other) => ({ departmentId: other.departmentId, departmentName: other.departmentName })) }])).values()];
  const teams = [...new Map(options.members.filter((m) => m.employeeId === employeeId).map((m) => [m.teamId, m])).values()];
  const selectedTeam = teams.find((m) => m.teamId === teamId);
  const chosenEmployee = options.members.find((m) => m.employeeId === employeeId);
  const leaders = [...new Map(options.grants.filter((g) => g.roleCode === 'TEAM_LEADER' && g.teamId === teamId && g.userId !== chosenEmployee?.userId).map((g) => [g.userId, g])).values()];
  const heads = [...new Map(options.grants.filter((g) => g.roleCode === 'DEPARTMENT_HEAD' && g.departmentId === (selectedTeam?.departmentId ?? editing?.workflowDepartmentId) && g.userId !== chosenEmployee?.userId && g.userId !== leaderId && g.userId !== editing?.confirmedBy).map((g) => [g.userId, g])).values()];
  const visible = (items ?? []).filter((item) => (filter === 'ALL' || filter === 'OPEN' && ['SUBMITTED', 'REQUESTED'].includes(item.status) || filter === 'ACTION' && (item.canConfirm || item.canReview) || item.approvalStage === filter || item.status === filter) && `${item.employeeCode} ${item.fullName} ${item.workDate}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const safePage = Math.min(page, Math.max(1, Math.ceil(visible.length / 10)));

  return <section className="subsection">
    {dialog}{message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}{error && <Notice kind="error">{error}</Notice>}
    <p className="muted">Nhân viên gửi → Leader xác nhận → Trưởng phòng duyệt/từ chối. Admin quản trị tuyến, không duyệt thay. Quyền hiện hành do Backend kiểm tra mỗi thao tác.</p>
    <div className="toolbar"><label>Trạng thái<select value={filter} disabled={busy} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="OPEN">Đang mở</option><option value="ACTION">Đến lượt tôi xử lý</option><option value="WAITING_ROUTING">Chờ phân tuyến</option><option value="LEADER_CONFIRMATION">Chờ Leader</option><option value="HEAD_APPROVAL">Chờ Trưởng phòng</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option><option value="ALL">Tất cả trong phạm vi</option></select></label><label>Tìm kiếm<input type="search" placeholder="Mã, họ tên, ngày công…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label><button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Đang xử lý…' : 'Tải lại'}</button></div>
    {items === null ? !error && <LoadingState /> : visible.length === 0 ? <EmptyState title="Chưa có đơn phù hợp" description="Đổi bộ lọc hoặc tải lại. Quản lý chỉ thấy đơn được chỉ định trong phạm vi quyền còn hiệu lực." /> : <>
      <div className="card-list">{visible.slice((safePage - 1) * 10, safePage * 10).map((item) => <article className="list-card" key={item.id}>
        <div><p className="mono">{item.employeeCode} · {issueLabels[item.issueType] ?? item.issueType}</p><h3>{item.fullName}</h3><small>Ngày công: {item.workDate} · Gửi: {formatDate(item.createdAt)}</small>
          <p>{item.approvalStage ? stageLabels[item.approvalStage] : 'Đơn lịch sử · giữ nguyên quyết định cũ'}</p>
          {item.source === 'ADMIN_REQUEST' && <p className="muted">Yêu cầu cũ: {item.requestNote}{item.dueAt && ` · Hạn phản hồi: ${formatDate(item.dueAt)}`}</p>}
          {item.teamName && <p className="muted">{item.departmentName} / {item.teamName} · Leader: {item.leaderName} → Trưởng phòng: {item.headName}</p>}
          {item.responseText && <p style={{ whiteSpace: 'pre-wrap' }}>{item.responseText}</p>}
          {item.evidenceImageReference ? <p><a href={`${new URL(apiUrl).origin}${item.evidenceImageReference}`} target="_blank" rel="noreferrer">Mở ảnh minh chứng có xác thực</a></p> : <p className="muted">Không đính kèm minh chứng.</p>}
          {item.confirmedAt && <p>Leader đã xác nhận: {item.confirmedByName} · {formatDate(item.confirmedAt)}{item.confirmationNote && ` · ${item.confirmationNote}`}</p>}
          {item.reviewedAt && <p>Người quyết định: {item.reviewedByName} · {formatDate(item.reviewedAt)}{item.reviewNote && ` · ${item.reviewNote}`}</p>}
          <div className="action-group"><button className="table-action" disabled={busy} onClick={() => void showHistory(item)} type="button">Lịch sử xử lý</button>{item.canReroute && <button className="table-action" disabled={busy} onClick={() => editItem(item)} type="button">Đổi tuyến</button>}</div>
        </div><div><StatusBadge value={item.status} /><div className="action-group">{item.canConfirm && <button className="table-action success-action" disabled={busy} onClick={() => void process(item, 'CONFIRM')}>Xác nhận bước 1</button>}{item.canReview && <><button className="table-action success-action" disabled={busy} onClick={() => void process(item, 'APPROVED')}>Duyệt bước 2</button><button className="table-action danger-action" disabled={busy} onClick={() => void process(item, 'REJECTED')}>Từ chối</button></>}</div></div>
      </article>)}</div><Pagination page={safePage} pageSize={10} total={visible.length} onPageChange={setPage} /></>}
    {history && <section className="editor-panel"><h3>Lịch sử đơn {history.id}</h3><button className="secondary-button" onClick={() => setHistory(null)} type="button">Đóng lịch sử</button>{history.entries.length === 0 ? <p className="muted">Đơn lịch sử chưa có audit theo luồng mới; không tạo bản ghi giả.</p> : <div className="audit-list">{history.entries.map((entry) => <div key={entry.id}><strong>{entry.action} · {entry.actorName} · {formatDate(entry.createdAt)}</strong><details><summary>Giá trị trước / sau</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ before: entry.oldValue, after: entry.newValue }, null, 2)}</pre></details></div>)}</div>}</section>}
    {admin && <section className="editor-panel" id="explanation-routing-editor"><h2>{editing ? `Đổi tuyến đơn · ${editing.fullName}` : 'Tuyến mặc định theo nhân viên'}</h2><p className="muted">Mỗi nhân viên chọn rõ một team/phòng và hai người có quyền hiện hành. Lưu tuyến mặc định cũng cập nhật đơn đang mở; không tự chọn phòng chính. Không cần phê duyệt lại thao tác của Admin.</p>
      <form className="form-grid" onSubmit={(e) => void saveRoute(e)}><fieldset className="span-2" disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        {editing ? <p><strong>{editing.employeeCode} · {editing.fullName}</strong></p> : <EmployeePicker employees={employees} value={employeeId} onChange={selectEmployee} />}
        <label>Team / phòng ban<select required value={teamId} disabled={Boolean(editing?.confirmedBy)} onChange={(e) => { setTeamId(e.target.value); setLeaderId(''); setHeadId(''); }}><option value="">Chọn team của nhân viên</option>{editing?.confirmedBy && !teams.some((t) => t.teamId === editing.workflowTeamId) && <option value={editing.workflowTeamId ?? ''}>{editing.departmentName} / {editing.teamName} · phạm vi đã xác nhận</option>}{teams.map((m) => <option key={m.teamId} value={m.teamId}>{m.departmentName} / {m.teamName}</option>)}</select></label>
        <label>Leader xác nhận<select required value={leaderId} disabled={Boolean(editing?.confirmedBy)} onChange={(e) => { setLeaderId(e.target.value); setHeadId(''); }}><option value="">Chọn Leader được cấp quyền</option>{editing?.confirmedBy && !leaders.some((g) => g.userId === editing.leaderUserId) && <option value={editing.leaderUserId ?? ''}>{editing.leaderName} · đã xác nhận</option>}{leaders.map((g) => <option key={g.userId} value={g.userId}>{g.name}</option>)}</select></label>
        <label>Trưởng phòng duyệt<select required value={headId} onChange={(e) => setHeadId(e.target.value)}><option value="">Chọn Trưởng phòng được cấp quyền</option>{heads.map((g) => <option key={g.userId} value={g.userId}>{g.name}</option>)}</select></label>
        <label>Lý do cấu hình / đổi tuyến<textarea required minLength={5} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </fieldset><div className="action-group"><button className="primary-button" disabled={busy || !employeeId || !teamId || !leaderId || !headId}>{busy ? 'Đang lưu…' : 'Lưu và áp dụng ngay'}</button>{editing && <button type="button" className="secondary-button" disabled={busy} onClick={() => selectEmployee('')}>Hủy đổi tuyến</button>}</div></form>
      {options.members.length === 0 && <p className="muted">Chưa có thành viên team hợp lệ. Cấu hình tại Tổ chức & phân quyền trước.</p>}
      <h3>Tuyến đã cấu hình</h3>{routes.length === 0 ? <p className="muted">Chưa có tuyến mặc định; đơn mới vẫn được tiếp nhận và chờ Admin phân tuyến.</p> : <div className="audit-list">{routes.map((r) => <div key={r.employeeId}><strong>{r.employeeCode} · {r.fullName}</strong><span>{r.teamName} · {r.leaderName} → {r.headName}</span><button className="table-action" disabled={busy} type="button" onClick={() => selectEmployee(r.employeeId)}>Chỉnh tuyến mặc định</button></div>)}</div>}
    </section>}
  </section>;
}
