'use client';

import { ClipboardList, GitBranch, RefreshCw, Search, Settings2, ShieldCheck, ArrowRight, CalendarDays } from 'lucide-react';
import { WorkflowDrawer, WorkflowSteps, WorkflowHistory } from '@/components/workflow-ui';
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
  decisionMethod: string | null; adminOverrideReason: string | null; canAdminReview: boolean;
  canConfirm: boolean; canReview: boolean; canReroute: boolean; routingRequired: boolean;
}
interface Route { employeeId: string; employeeCode: string; fullName: string; teamId: string; teamName: string; leaderUserId: string; leaderName: string; headUserId: string; headName: string; version: number; }
interface Member { employeeId: string; userId: string; employeeCode: string; fullName: string; teamId: string; teamName: string; departmentId: string; departmentName: string; }
interface Grant { userId: string; employeeId: string; name: string; roleCode: string; teamId: string | null; departmentId: string; }
interface Options { members: Member[]; grants: Grant[]; }
interface Audit { id: string; action: string; actorName: string; createdAt: string; oldValue: unknown; newValue: unknown; }
const stageLabels: Record<string, string> = { EMPLOYEE_RESPONSE: 'Chờ nhân viên phản hồi yêu cầu cũ', WAITING_ROUTING: 'Chờ Admin xử lý tuyến', LEADER_CONFIRMATION: 'Bước 1 · Chờ Leader xác nhận', HEAD_APPROVAL: 'Bước 2 · Chờ Trưởng phòng duyệt', COMPLETED: 'Đã kết thúc xử lý' };
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
  const [view, setView] = useState<'QUEUE' | 'ROUTES'>('QUEUE');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [routeSearch, setRouteSearch] = useState(''); const [routePage, setRoutePage] = useState(1);
  const { request, dialog } = useActionDialog();

  async function load(): Promise<void> {
    setItems(null); setHistory(null); setDetailId(null);
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
  useEffect(() => {
    const focus = () => { if (document.querySelector('.dialog-backdrop')) return; void load().catch((caught: unknown) => { setError(caught instanceof Error ? caught.message : 'Không còn đọc được phạm vi.'); }); };
    window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus);
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
    setDetailId(null); setView('ROUTES');
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
  async function process(item: Explanation, action: 'CONFIRM' | 'APPROVED' | 'REJECTED', fallback = false): Promise<void> {
    if (busy) return; setBusy(true);
    const note = await request({ title: fallback ? `Admin ${action === 'APPROVED' ? 'duyệt' : 'từ chối'} thay giải trình` : action === 'CONFIRM' ? 'Leader xác nhận giải trình' : action === 'APPROVED' ? 'Duyệt giải trình' : 'Từ chối giải trình', description: fallback ? 'Chỉ thực hiện khi tuyến thiếu hoặc không còn hợp lệ. Backend kiểm tra lại quyền, giữ lịch sử xác nhận và thông báo tên bạn cho nhân viên.' : action === 'CONFIRM' ? 'Xác nhận bước 1 và chuyển cho Trưởng phòng; chưa phải quyết định phê duyệt.' : 'Quyết định cuối thông báo tên người xử lý; không tự sửa bảng công.', confirmLabel: action === 'CONFIRM' ? 'Xác nhận và chuyển tiếp' : action === 'APPROVED' ? 'Xác nhận duyệt' : 'Xác nhận từ chối', fieldLabel: fallback ? 'Lý do Admin xử lý thay (bắt buộc)' : 'Ghi chú / lý do (không bắt buộc)', required: fallback, minLength: fallback ? 5 : undefined, danger: action === 'REJECTED' });
    if (note === null) { setBusy(false); return; } setError(''); setMessage('');
    try {
      await apiRequest(`/attendance/explanations/${item.id}/${action === 'CONFIRM' ? 'confirm' : 'review'}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: item.routeVersion, ...(action === 'CONFIRM' ? { confirmationNote: note } : { status: action, reviewNote: note, ...(fallback ? { adminOverrideReason: note } : {}) }) }) });
      setMessage(action === 'CONFIRM' ? 'Đã xác nhận; chuyển Trưởng phòng duyệt.' : 'Đã ghi quyết định và gửi thông báo vào hộp thư nhân viên.'); await load(); await onChanged?.();
    } catch (caught) { setItems(null); setHistory(null); setDetailId(null); setError(caught instanceof Error ? caught.message : 'Không thể xử lý đơn. Tải lại để kiểm tra, không tự gửi lại.'); } finally { setBusy(false); }
  }
  async function showHistory(item: Explanation): Promise<void> {
    if (busy) return; setBusy(true); setError(''); setHistory(null); setDetailId(item.id);
    try { setHistory({ id: item.id, entries: await apiRequest<Audit[]>(`/attendance/explanations/${item.id}/history`) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không tải được audit.'); } finally { setBusy(false); }
  }
  const employees = [...new Map(options.members.map((m) => [m.employeeId, { id: m.employeeId, employeeCode: m.employeeCode, fullName: m.fullName, organizationAssignments: options.members.filter((other) => other.employeeId === m.employeeId).map((other) => ({ departmentId: other.departmentId, departmentName: other.departmentName })) }])).values()];
  const teams = [...new Map(options.members.filter((m) => m.employeeId === employeeId).map((m) => [m.teamId, m])).values()];
  const selectedTeam = teams.find((m) => m.teamId === teamId);
  const chosenEmployee = options.members.find((m) => m.employeeId === employeeId);
  const leaders = [...new Map(options.grants.filter((g) => g.roleCode === 'TEAM_LEADER' && g.teamId === teamId && g.userId !== chosenEmployee?.userId).map((g) => [g.userId, g])).values()];
  const heads = [...new Map(options.grants.filter((g) => g.roleCode === 'DEPARTMENT_HEAD' && g.departmentId === (selectedTeam?.departmentId ?? editing?.workflowDepartmentId) && g.userId !== chosenEmployee?.userId && g.userId !== leaderId && g.userId !== editing?.confirmedBy).map((g) => [g.userId, g])).values()];
  const routeChoicesValid = Boolean(employeeId && teamId && leaderId && headId && (editing?.confirmedBy || chosenEmployee && selectedTeam && leaders.some(grant => grant.userId === leaderId)) && heads.some(grant => grant.userId === headId));
  const visible = (items ?? []).filter((item) => (filter === 'ALL' || filter === 'OPEN' && ['SUBMITTED', 'REQUESTED'].includes(item.status) || filter === 'ACTION' && (item.canConfirm || item.canReview || item.canAdminReview) || item.approvalStage === filter || item.status === filter) && `${item.employeeCode} ${item.fullName} ${item.workDate}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const safePage = Math.min(page, Math.max(1, Math.ceil(visible.length / 10)));

  const detail = (items ?? []).find(item => item.id === detailId);
  const openItems = (items ?? []).filter(item => ['SUBMITTED','REQUESTED'].includes(item.status));
  const actionCount = openItems.filter(item => item.canConfirm || item.canReview || item.canAdminReview).length;
  const routingCount = openItems.filter(item => item.routingRequired).length;
  const filteredRoutes = routes.filter(route => `${route.employeeCode} ${route.fullName} ${route.teamName}`.toLocaleLowerCase('vi').includes(routeSearch.trim().toLocaleLowerCase('vi')));
  const safeRoutePage = Math.min(routePage, Math.max(1, Math.ceil(filteredRoutes.length / 10)));
  function closeDetail(): void {
    const opener = document.getElementById(`workflow-open-${detailId}`);
    setDetailId(null); setHistory(null);
    window.queueMicrotask(() => opener?.focus());
  }
  function changeView(value: 'QUEUE' | 'ROUTES'): void { if (!busy) { setView(value); setDetailId(null); } }

  return <section className="workflow-workspace">
    {dialog}{message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}{error && <Notice kind="error">{error}</Notice>}
    <div className="workflow-summary">
      <button type="button" disabled={busy || items === null} onClick={() => { changeView('QUEUE'); setFilter('OPEN'); setPage(1); }}><span className="workflow-summary-icon"><ClipboardList size={20} /></span><span><small>Đơn đang mở</small><strong>{items === null ? '—' : openItems.length}</strong></span></button>
      <button type="button" disabled={busy || items === null} onClick={() => { changeView('QUEUE'); setFilter('ACTION'); setPage(1); }}><span className="workflow-summary-icon"><ShieldCheck size={20} /></span><span><small>Đến lượt bạn xử lý</small><strong>{items === null ? '—' : actionCount}</strong></span></button>
      <button type="button" disabled={busy || items === null} onClick={() => { changeView('QUEUE'); setFilter('WAITING_ROUTING'); setPage(1); }}><span className="workflow-summary-icon warning"><GitBranch size={20} /></span><span><small>Tuyến cần xử lý</small><strong>{items === null ? '—' : routingCount}</strong></span></button>
    </div>
    <nav className="workflow-tabs" aria-label="Khu vực xử lý"><button type="button" aria-current={view === 'QUEUE' ? 'page' : undefined} disabled={busy} onClick={() => changeView('QUEUE')}><ClipboardList size={17} />Hàng đợi đơn</button>{admin && <button type="button" aria-current={view === 'ROUTES' ? 'page' : undefined} disabled={busy} onClick={() => changeView('ROUTES')}><Settings2 size={17} />Cấu hình tuyến</button>}<button type="button" className="workflow-refresh" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} className={busy ? 'workflow-spin' : ''} />{busy ? 'Đang xử lý…' : 'Tải lại'}</button></nav>
    {view === 'QUEUE' && <>
      <div className="workflow-queue-toolbar"><div className="workflow-search"><Search size={17} aria-hidden="true" /><input aria-label="Tìm đơn theo mã nhân viên, họ tên hoặc ngày" type="search" placeholder="Tìm mã nhân viên, họ tên, ngày…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div><span className="muted">{items === null ? 'Đang tải dữ liệu' : `${visible.length} đơn trong phạm vi`}</span></div>
      <div className="workflow-filters" aria-label="Lọc trạng thái"><button type="button" aria-pressed={filter === 'OPEN'} disabled={busy} onClick={() => { setFilter('OPEN'); setPage(1); }}>Đang mở</button><button type="button" aria-pressed={filter === 'ACTION'} disabled={busy} onClick={() => { setFilter('ACTION'); setPage(1); }}>Đến lượt tôi</button><button type="button" aria-pressed={filter === 'WAITING_ROUTING'} disabled={busy} onClick={() => { setFilter('WAITING_ROUTING'); setPage(1); }}>Cần Admin</button><button type="button" aria-pressed={filter === 'LEADER_CONFIRMATION'} disabled={busy} onClick={() => { setFilter('LEADER_CONFIRMATION'); setPage(1); }}>Chờ Leader</button><button type="button" aria-pressed={filter === 'HEAD_APPROVAL'} disabled={busy} onClick={() => { setFilter('HEAD_APPROVAL'); setPage(1); }}>Chờ Trưởng phòng</button><button type="button" aria-pressed={filter === 'APPROVED'} disabled={busy} onClick={() => { setFilter('APPROVED'); setPage(1); }}>Đã duyệt</button><button type="button" aria-pressed={filter === 'REJECTED'} disabled={busy} onClick={() => { setFilter('REJECTED'); setPage(1); }}>Từ chối</button><button type="button" aria-pressed={filter === 'EMPLOYEE_RESPONSE'} disabled={busy} onClick={() => { setFilter('EMPLOYEE_RESPONSE'); setPage(1); }}>Chờ phản hồi</button><button type="button" aria-pressed={filter === 'ALL'} disabled={busy} onClick={() => { setFilter('ALL'); setPage(1); }}>Tất cả</button></div>
      {items === null ? !error && <LoadingState /> : visible.length === 0 ? <EmptyState title="Chưa có đơn phù hợp" description="Thử thay đổi bộ lọc hoặc tìm kiếm. Danh sách chỉ hiển thị dữ liệu trong phạm vi quyền hiện hành." /> : <>
        <div className="workflow-list">{visible.slice((safePage - 1) * 10, safePage * 10).map(item => <article className="workflow-card" key={item.id}>
          <div className="workflow-card-main"><div className="workflow-person"><span className="workflow-avatar" aria-hidden="true">{item.fullName?.trim().slice(0,1).toLocaleUpperCase('vi') || '?'}</span><div><h3>{item.fullName}</h3><span className="workflow-code">{item.employeeCode}</span></div></div>
            <div className="workflow-card-meta"><span><CalendarDays size={15} />{item.workDate}</span><span>{issueLabels[item.issueType] ?? item.issueType}</span></div>
            <p className="workflow-preview">{item.responseText ?? item.requestNote ?? 'Chờ nhân viên phản hồi'}</p>
            <span className={item.routingRequired ? 'workflow-stage warning' : 'workflow-stage'}>{item.decisionMethod === 'ADMIN_FALLBACK' ? 'Admin đã quyết định thay' : item.approvalStage ? stageLabels[item.approvalStage] : 'Đơn lịch sử'}</span>
          </div>
          <div className="workflow-card-side"><StatusBadge value={item.status} /><p>{item.reviewedByName ? `Người quyết định: ${item.reviewedByName}` : item.teamName ?? 'Chưa có tuyến hợp lệ'}</p><button id={`workflow-open-${item.id}`} type="button" className="secondary-button" disabled={busy} onClick={() => void showHistory(item)}>Xem & xử lý<ArrowRight size={15} /></button></div>
        </article>)}</div><Pagination page={safePage} pageSize={10} total={visible.length} onPageChange={setPage} />
      </>}
      <p className="workflow-help">Leader xác nhận → Trưởng phòng quyết định. {admin ? 'Admin chỉ xử lý thay khi tuyến thiếu hoặc không còn hợp lệ, có lý do và lưu vết.' : 'Quyền xử lý được Backend kiểm tra tại mỗi thao tác.'}</p>
    </>}
    {admin && view === 'ROUTES' && <div className="workflow-routing">
      <section className="workflow-panel" id="explanation-routing-editor"><header className="workflow-panel-header"><span className="workflow-eyebrow">THIẾT LẬP TUYẾN</span><h2>{editing ? `Đổi tuyến · ${editing.fullName}` : 'Tuyến mặc định theo nhân viên'}</h2><p>Chọn team và hai người xử lý. Lưu áp dụng ngay cho các bước chưa hoàn tất; không sửa người hay thời điểm đã xác nhận.</p></header>

        <form className="form-grid workflow-route-form" onSubmit={(e) => void saveRoute(e)}><fieldset className="workflow-route-fields" disabled={busy}>
        {editing ? <p><strong>{editing.employeeCode} · {editing.fullName}</strong></p> : <EmployeePicker employees={employees} value={employeeId} onChange={selectEmployee} />}
        <label>Team / phòng ban<select required value={teamId} disabled={Boolean(editing?.confirmedBy)} onChange={(e) => { setTeamId(e.target.value); setLeaderId(''); setHeadId(''); }}><option value="">Chọn team của nhân viên</option>{editing?.confirmedBy && !teams.some((t) => t.teamId === editing.workflowTeamId) && <option value={editing.workflowTeamId ?? ''}>{editing.departmentName} / {editing.teamName} · phạm vi đã xác nhận</option>}{teams.map((m) => <option key={m.teamId} value={m.teamId}>{m.departmentName} / {m.teamName}</option>)}</select></label>
        <label>Leader xác nhận<select required value={leaderId} disabled={Boolean(editing?.confirmedBy)} onChange={(e) => { setLeaderId(e.target.value); setHeadId(''); }}><option value="">Chọn Leader được cấp quyền</option>{editing?.confirmedBy && !leaders.some((g) => g.userId === editing.leaderUserId) && <option value={editing.leaderUserId ?? ''}>{editing.leaderName} · đã xác nhận</option>}{leaders.map((g) => <option key={g.userId} value={g.userId}>{g.name}</option>)}</select></label>
        <label>Trưởng phòng duyệt<select required value={headId} onChange={(e) => setHeadId(e.target.value)}><option value="">Chọn Trưởng phòng được cấp quyền</option>{heads.map((g) => <option key={g.userId} value={g.userId}>{g.name}</option>)}</select></label>
        <label className="workflow-field-wide">Lý do cấu hình / đổi tuyến<textarea required minLength={5} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </fieldset><div className="workflow-form-actions"><button className="primary-button" disabled={busy || !routeChoicesValid}>{busy ? 'Đang lưu…' : 'Lưu và áp dụng ngay'}</button>{editing && <button type="button" className="secondary-button" disabled={busy} onClick={() => selectEmployee('')}>Hủy chỉnh sửa</button>}</div></form>

        {options.members.length === 0 && <div className="workflow-panel-note"><Notice kind="info">Chưa có thành viên team hợp lệ. <a href="/dashboard/organization">Cấu hình Tổ chức & phân quyền</a> trước khi đặt tuyến. Đơn đã gửi vẫn được giữ trong hàng đợi.</Notice></div>}
      </section>
      <section className="workflow-panel"><header className="workflow-panel-header"><span className="workflow-eyebrow">TỔNG QUAN CẤU HÌNH</span><h2>Tuyến đã thiết lập <span className="workflow-count">{routes.length}</span></h2><p>Lịch sử cấu hình được giữ lại, kể cả khi người hoặc team ngừng hoạt động. Lựa chọn mới chỉ dùng quyền hợp lệ.</p></header>
        <div className="workflow-route-search workflow-search"><Search size={16} aria-hidden="true" /><input aria-label="Tìm tuyến đã cấu hình" type="search" placeholder="Tìm nhân viên hoặc team…" value={routeSearch} onChange={event => { setRouteSearch(event.target.value); setRoutePage(1); }} /></div>
        {filteredRoutes.length === 0 ? <EmptyState title="Chưa có tuyến phù hợp" description="Chọn nhân viên trong biểu mẫu để thiết lập, hoặc đổi từ khóa tìm kiếm." /> : <div className="workflow-route-list">{filteredRoutes.slice((safeRoutePage - 1) * 10,safeRoutePage * 10).map(route => <article key={route.employeeId} className="workflow-route-card"><div><h3>{route.fullName}</h3><small>{route.employeeCode} · {route.teamName}</small>{!employees.some(employee => employee.id === route.employeeId) && <p className="workflow-route-historical">Không còn trong lựa chọn cấu hình hiện hành</p>}<div className="workflow-route-people"><span>{route.leaderName}</span><ArrowRight size={14} /><span>{route.headName}</span></div></div><button type="button" className="table-action" disabled={busy || !employees.some(employee => employee.id === route.employeeId)} onClick={() => { selectEmployee(route.employeeId); document.getElementById('explanation-routing-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Chỉnh tuyến</button></article>)}</div>}
        <Pagination page={safeRoutePage} pageSize={10} total={filteredRoutes.length} onPageChange={setRoutePage} />
      </section>
    </div>}
    {detail && <WorkflowDrawer title={detail.fullName} subtitle={`${detail.employeeCode} · Đơn giải trình`} busy={busy} onClose={closeDetail}>
      <div className="workflow-detail-status"><StatusBadge value={detail.status} /><span>{detail.decisionMethod === 'ADMIN_FALLBACK' ? 'Admin quyết định thay' : detail.approvalStage ? stageLabels[detail.approvalStage] : 'Đơn lịch sử'}</span></div>
      <dl className="workflow-facts"><div><dt>Ngày công</dt><dd>{detail.workDate}</dd></div><div><dt>Vấn đề</dt><dd>{issueLabels[detail.issueType] ?? detail.issueType}</dd></div><div><dt>Gửi lúc</dt><dd>{formatDate(detail.createdAt)}</dd></div>{detail.dueAt && <div><dt>Hạn phản hồi yêu cầu cũ</dt><dd>{formatDate(detail.dueAt)}</dd></div>}</dl><div className="workflow-detail-block"><h3>Nội dung giải trình</h3><p className="workflow-full-text">{detail.responseText ?? detail.requestNote ?? 'Chưa có phản hồi.'}</p>{detail.evidenceImageReference ? <a className="secondary-button" href={`${new URL(apiUrl).origin}${detail.evidenceImageReference}`} target="_blank" rel="noreferrer">Mở ảnh minh chứng có xác thực</a> : <p className="muted">Không đính kèm minh chứng.</p>}</div>
      <div className="workflow-detail-block"><h3>Tuyến & người xử lý</h3>{detail.teamName && <p className="muted">{detail.departmentName} / {detail.teamName}</p>}<WorkflowSteps leader={detail.leaderName} head={detail.headName} confirmed={detail.confirmedByName} confirmedAt={detail.confirmedAt} reviewed={detail.reviewedByName} reviewedAt={detail.reviewedAt} fallback={detail.decisionMethod === 'ADMIN_FALLBACK'} terminal={!['SUBMITTED','REQUESTED'].includes(detail.status)} />{detail.confirmationNote && <p className="workflow-full-text">Ghi chú xác nhận: {detail.confirmationNote}</p>}{detail.reviewNote && <p className="workflow-full-text">Ghi chú quyết định: {detail.reviewNote}</p>}{detail.adminOverrideReason && <Notice kind="info">Lý do Admin xử lý thay: {detail.adminOverrideReason}</Notice>}</div>
      {detail.canAdminReview && <Notice kind="info"><strong>Tuyến đang thiếu hoặc không còn hợp lệ.</strong> Bạn có thể cấu hình lại, hoặc quyết định thay với lý do. Nhân viên sẽ nhận thông báo tên người xử lý.</Notice>}
      <div className="workflow-detail-actions">{detail.canConfirm && <button type="button" className="primary-button" disabled={busy} onClick={() => void process(detail,'CONFIRM')}>Xác nhận & chuyển tiếp</button>}{detail.canReview && <><button type="button" className="primary-button" disabled={busy} onClick={() => void process(detail,'APPROVED')}>Duyệt đơn</button><button type="button" className="danger-button" disabled={busy} onClick={() => void process(detail,'REJECTED')}>Từ chối</button></>}{detail.canAdminReview && <><button type="button" className="primary-button" disabled={busy} onClick={() => void process(detail,'APPROVED',true)}><ShieldCheck size={17} />Admin duyệt thay</button><button type="button" className="danger-button" disabled={busy} onClick={() => void process(detail,'REJECTED',true)}>Từ chối thay</button></>}{detail.canReroute && <button type="button" className="secondary-button" disabled={busy} onClick={() => editItem(detail)}><GitBranch size={16} />Đổi tuyến</button>}</div>
      <div className="workflow-detail-block"><h3>Lịch sử xử lý</h3>{history?.id === detail.id ? <WorkflowHistory entries={history.entries} /> : busy ? <LoadingState /> : <p className="muted">Chưa tải được lịch sử. Đóng chi tiết và mở lại để thử lại.</p>}</div>
    </WorkflowDrawer>}
  </section>;
}
