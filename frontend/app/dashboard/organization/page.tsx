'use client';

import { History, Network, Pencil, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, Pagination, StatusBadge, ToastNotice, formatDate } from '@/components/admin-ui';
import { EmployeePicker, type EmployeePickerOption } from '@/components/employee-picker';
import { useActionDialog } from '@/components/use-action-dialog';
import { apiRequest } from '@/lib/auth-api';
import { useClientPagination } from '@/lib/use-client-pagination';
import type { ManagementGrant, OrganizationAudit, OrganizationMember, OrganizationTeam } from '@/lib/organization-api';

interface Department { id: string; name: string; isActive: boolean }
interface Employee extends EmployeePickerOption { userId: string | null; isActive: boolean }
interface Foundation { departments: Department[]; employees: Employee[]; teams: OrganizationTeam[]; grants: ManagementGrant[] }
type Perform = (action: () => Promise<unknown>, message: string) => Promise<boolean>;
type ScopedEmployee = EmployeePickerOption & { branches: string[] };

const roleLabels = { DEPARTMENT_HEAD: 'Trưởng phòng', TEAM_LEADER: 'Leader team' };
const grantLabels = { ACTIVE: 'Đang hiệu lực', SCHEDULED: 'Chưa đến hạn', EXPIRED: 'Hết hạn', REVOKED: 'Đã thu hồi', INACTIVE: 'Tạm không hiệu lực' };
const auditLabels: Record<string, string> = { CREATE: 'Tạo team', UPDATE: 'Sửa team', ADD: 'Thêm thành viên', END: 'Rút thành viên', GRANT: 'Cấp quyền', REVOKE: 'Thu hồi quyền' };

function localNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function fetchFoundation(): Promise<Foundation> {
  const [departments, employees, teams, grants] = await Promise.all([
    apiRequest<Department[]>('/employees/lookups/departments'),
    apiRequest<Employee[]>('/employees'),
    apiRequest<OrganizationTeam[]>('/organization/teams'),
    apiRequest<ManagementGrant[]>('/organization/grants'),
  ]);
  return { departments, employees, teams, grants };
}

export default function OrganizationPage() {
  const [data, setData] = useState<Foundation | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [tab, setTab] = useState<'teams' | 'grants' | 'history'>('teams');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [memberVersion, setMemberVersion] = useState(0);
  const [history, setHistory] = useState<OrganizationAudit[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyDetail, setHistoryDetail] = useState<OrganizationAudit | null>(null);
  const { request, dialog } = useActionDialog();

  useEffect(() => {
    let active = true;
    fetchFoundation().then((value) => { if (active) setData(value); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Không thể tải cơ cấu tổ chức.'); });
    return () => { active = false; };
  }, []);

  async function reload(): Promise<void> {
    setError('');
    try { setData(await fetchFoundation()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu.'); }
  }

  const perform: Perform = async (action, success) => {
    if (busy.current) return false;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    let completed = false;
    try {
      await action(); completed = true; setMessage(success);
      setMemberVersion((version) => version + 1); setHistory(null);
      setData(await fetchFoundation());
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác.';
      setError(completed ? `Thao tác đã được lưu nhưng chưa tải lại được dữ liệu. ${detail}` : detail);
    } finally { busy.current = false; setSaving(false); }
    return completed;
  };

  async function createTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const element = event.currentTarget;
    const fields = new FormData(element);
    const success = await perform(() => apiRequest('/organization/teams', { method: 'POST', body: JSON.stringify({ departmentId: fields.get('departmentId'), code: fields.get('code'), name: fields.get('name') }) }), 'Đã tạo team. Thêm thành viên và cấp quyền quản lý riêng bên dưới.');
    if (success) element.reset();
  }

  async function revokeGrant(grant: ManagementGrant): Promise<void> {
    const reason = await request({ title: 'Thu hồi quyền quản lý', description: `${grant.employeeName} sẽ mất quyền ${roleLabels[grant.roleCode]} trong phạm vi này ngay sau khi lưu. Tài khoản và quyền khác không bị thay đổi.`, confirmLabel: 'Thu hồi quyền', fieldLabel: 'Lý do', required: true, danger: true });
    if (reason === null) return;
    await perform(() => apiRequest(`/organization/grants/${grant.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Đã thu hồi quyền. Backend kiểm tra hiệu lực mới ở lần truy cập tiếp theo.');
  }

  async function loadHistory(): Promise<void> {
    setHistoryLoading(true); setHistoryError('');
    try { setHistory(await apiRequest<OrganizationAudit[]>('/organization/history')); }
    catch (caught) { setHistoryError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử.'); }
    finally { setHistoryLoading(false); }
  }

  const selectedTeam = data?.teams.find((team) => team.id === selectedTeamId);
  const grantsPagination = useClientPagination(data?.grants ?? [], 15);
  const teamsPagination = useClientPagination(data?.teams ?? [], 15);
  const historyPagination = useClientPagination(history ?? [], 15);

  return <section className="module-page">
    <PageHeader eyebrow="CƠ CẤU & QUYỀN QUẢN LÝ" title="Tổ chức & phân quyền" description="Team thuộc một phòng ban, có thể xuyên chi nhánh. Admin cấp quyền quản lý riêng theo từng phạm vi và thời hạn." />
    <Notice>Thành viên không tự có quyền quản lý. PQ1 chỉ cấp quyền đọc danh sách tổ chức cơ bản; tuyến duyệt đơn và phiên Web + App đồng thời chưa triển khai.</Notice>
    {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
    {error && <Notice kind="error">{error} <button className="table-action" type="button" disabled={saving} onClick={() => void reload()}>Tải lại</button></Notice>}
    {!data && !error && <LoadingState />}
    {data && <>
      <div className="organization-tabs" role="group" aria-label="Nội dung tổ chức">
        <button type="button" className={tab === 'teams' ? 'primary-button' : 'secondary-button'} onClick={() => setTab('teams')}><Network size={16} /> Team & thành viên</button>
        <button type="button" className={tab === 'grants' ? 'primary-button' : 'secondary-button'} onClick={() => setTab('grants')}><ShieldCheck size={16} /> Quyền quản lý</button>
        <button type="button" className={tab === 'history' ? 'primary-button' : 'secondary-button'} disabled={saving || historyLoading} onClick={() => { setTab('history'); if (!history) void loadHistory(); }}><History size={16} /> Lịch sử</button>
      </div>
      {tab === 'teams' && <>
        <details className="editor-panel">
          <summary><Plus size={16} /> Tạo team</summary>
          <form className="form-grid" onSubmit={(event) => void createTeam(event)}>
            <fieldset className="organization-fields" disabled={saving}>
              <label>Phòng ban<select name="departmentId" required defaultValue=""><option value="">Chọn phòng ban</option>{data.departments.filter((department) => department.isActive).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label>Mã team<input name="code" required maxLength={30} pattern="[A-Za-z0-9_-]+" placeholder="VD: KYTHUAT_01" /><small>Mã duy nhất trong phòng ban; không đổi sau khi tạo.</small></label>
              <label>Tên team<input name="name" required maxLength={150} /></label>
              <button className="primary-button" type="submit">{saving ? 'Đang lưu…' : 'Tạo team'}</button>
            </fieldset>
          </form>
        </details>
        {data.teams.length === 0 ? <EmptyState title="Chưa có team" description="Tạo team trong một phòng ban, sau đó bổ sung thành viên và chỉ định quản lý." /> : <>
          <div className="table-wrap"><table><thead><tr><th>Team</th><th>Phòng ban</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{teamsPagination.items.map((team) => <tr key={team.id}><td><strong>{team.name}</strong><br /><small>{team.code}</small></td><td>{team.departmentName}</td><td><StatusBadge value={team.isActive && team.departmentActive ? 'ACTIVE' : 'INACTIVE'} /></td><td><button className="table-action" disabled={saving} type="button" onClick={() => setSelectedTeamId(team.id)}><UsersRound size={14} /> Thành viên & cấu hình</button></td></tr>)}</tbody></table></div>
          <Pagination page={teamsPagination.page} pageSize={teamsPagination.pageSize} total={data.teams.length} onPageChange={teamsPagination.setPage} />
        </>}
        {selectedTeam && <TeamEditor key={selectedTeam.id} team={selectedTeam} saving={saving} version={memberVersion} perform={perform} request={request} />}
      </>}
      {tab === 'grants' && <>
        <GrantForm departments={data.departments.filter((department) => department.isActive)} teams={data.teams.filter((team) => team.isActive && team.departmentActive)} employees={data.employees.filter((employee) => employee.isActive && employee.userId)} saving={saving} perform={perform} />
        <p className="scope-note">Trưởng phòng đọc phạm vi phòng được cấp, Leader đọc team được cấp. Không kế thừa quyền Admin. Muốn đổi phạm vi/thời hạn: thu hồi quyền cũ rồi cấp lại để giữ lịch sử.</p>
        {data.grants.length === 0 ? <EmptyState title="Chưa cấp quyền quản lý" description="Chọn người có tài khoản đang hoạt động và cấp quyền theo phòng ban hoặc team." /> : <>
          <div className="table-wrap"><table><thead><tr><th>Nhân sự</th><th>Vai trò & phạm vi</th><th>Thời hạn</th><th>Hiệu lực</th><th>Quyết định</th><th>Thao tác</th></tr></thead><tbody>{grantsPagination.items.map((grant) => <tr key={grant.id}>
            <td><strong>{grant.employeeName}</strong><br /><small>{grant.employeeCode}</small></td>
            <td>{roleLabels[grant.roleCode]}<br /><small>{grant.departmentName}{grant.teamName ? ` / ${grant.teamName}` : ''}</small><br /><small>{grant.appointmentType === 'TEMPORARY' ? 'Tạm thời' : 'Chính thức'}</small></td>
            <td>{formatDate(grant.validFrom)}<br /><small>Đến: {grant.validUntil ? formatDate(grant.validUntil) : 'Vô thời hạn'}</small></td>
            <td><span className={`status-badge status-${grant.status === 'ACTIVE' ? 'success' : grant.status === 'REVOKED' ? 'danger' : 'warning'}`}>{grantLabels[grant.status]}</span></td>
            <td>{grant.reason}<br /><small>Cấp bởi: {grant.createdByName}</small>{grant.revokedAt && <><br /><small>Thu hồi: {formatDate(grant.revokedAt)} · {grant.revokedByName}<br />{grant.revocationReason}</small></>}</td>
            <td>{!grant.revokedAt && <button className="table-action danger-action" disabled={saving} type="button" onClick={() => void revokeGrant(grant)}>Thu hồi</button>}</td>
          </tr>)}</tbody></table></div><Pagination page={grantsPagination.page} pageSize={grantsPagination.pageSize} total={data.grants.length} onPageChange={grantsPagination.setPage} />
        </>}
      </>}
      {tab === 'history' && <>
        <p className="scope-note">200 thao tác tổ chức/phân quyền gần nhất. Lịch sử gốc không bị sửa khi đổi team hoặc thu hồi quyền.</p>
        <button className="secondary-button" disabled={historyLoading} onClick={() => void loadHistory()} type="button">Tải lại lịch sử</button>
        {historyError && <Notice kind="error">{historyError}</Notice>}
        {historyLoading && <LoadingState />}
        {!historyLoading && history?.length === 0 && <EmptyState title="Chưa có lịch sử" description="Các lần thay đổi sẽ được Backend ghi lại cùng người thao tác." />}
        {!historyLoading && !!history?.length && <><div className="table-wrap"><table><thead><tr><th>Thời điểm</th><th>Người thao tác</th><th>Thay đổi</th><th>Chi tiết</th></tr></thead><tbody>{historyPagination.items.map((item) => <tr key={item.id}><td>{formatDate(item.createdAt)}</td><td>{item.actorName}</td><td>{auditLabels[item.action] ?? item.action}</td><td><button className="table-action" onClick={() => setHistoryDetail(item)} type="button">Xem trước/sau</button></td></tr>)}</tbody></table></div><Pagination page={historyPagination.page} pageSize={historyPagination.pageSize} total={history?.length ?? 0} onPageChange={historyPagination.setPage} /></>}
        {historyDetail && <details className="editor-panel" open><summary>Chi tiết · {auditLabels[historyDetail.action] ?? historyDetail.action}</summary><div className="organization-audit"><p>{historyDetail.resourceType} · {historyDetail.resourceId}</p><h3>Trước</h3><pre>{JSON.stringify(historyDetail.oldValue, null, 2)}</pre><h3>Sau</h3><pre>{JSON.stringify(historyDetail.newValue, null, 2)}</pre><button className="secondary-button" type="button" onClick={() => setHistoryDetail(null)}>Đóng chi tiết</button></div></details>}
      </>}
    </>}
    {dialog}
  </section>;
}

function TeamEditor({ team, saving, version, perform, request }: { team: OrganizationTeam; saving: boolean; version: number; perform: Perform; request: ReturnType<typeof useActionDialog>['request'] }) {
  const [state, setState] = useState<{ members: OrganizationMember[]; candidates: ScopedEmployee[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [showEnded, setShowEnded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<OrganizationMember[]>(`/organization/teams/${team.id}/members`),apiRequest<ScopedEmployee[]>(`/organization/departments/${team.departmentId}/employees`)])
      .then(([members, candidates]) => { if (active) { setState({ members,candidates }); setError(''); setLoading(false); } })
      .catch((caught: unknown) => { if (active) { setError(caught instanceof Error ? caught.message : 'Không thể tải thành viên.'); setLoading(false); } });
    return () => { active = false; };
  }, [team.id,team.departmentId,version,retry]);

  const currentMembers = state?.members.filter((member) => member.status !== 'ENDED') ?? [];
  const candidates = state?.candidates.filter((employee) => !currentMembers.some((member) => member.employeeId === employee.id)) ?? [];

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (await perform(() => apiRequest(`/organization/teams/${team.id}/members`, { method: 'POST',body: JSON.stringify({ employeeId }) }), 'Đã thêm thành viên. Thao tác này không cấp quyền quản lý.')) setEmployeeId('');
  }
  async function end(member: OrganizationMember): Promise<void> {
    const reason = await request({ title: 'Rút thành viên khỏi team',description: `Kết thúc phân công của ${member.fullName} trong ${team.name}; giữ nguyên lịch sử. Quyền quản lý được cấp riêng không tự bị thu hồi.`,confirmLabel: 'Rút thành viên',fieldLabel: 'Lý do',required: true,danger: true });
    if (reason !== null) await perform(() => apiRequest(`/organization/teams/${team.id}/members/${member.id}/end`, { method: 'POST',body: JSON.stringify({ reason }) }), 'Đã kết thúc phân công team.');
  }
  async function update(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const isActive = fields.get('isActive') === 'true';
    if (isActive !== team.isActive) {
      const confirm = await request({ title: isActive ? 'Khôi phục team' : 'Ngừng hoạt động team',description: isActive ? 'Quyền chưa hết hạn/chưa thu hồi sẽ có hiệu lực lại nếu phòng ban còn hoạt động.' : 'Quyền quản lý team tạm mất hiệu lực. Thành viên, quyền và lịch sử vẫn được giữ.',confirmLabel: isActive ? 'Khôi phục' : 'Ngừng hoạt động',danger: !isActive });
      if (confirm === null) return;
    }
    await perform(() => apiRequest(`/organization/teams/${team.id}`, { method: 'PATCH',body: JSON.stringify({ name: fields.get('name'),isActive }) }), 'Đã cập nhật team.');
  }
  const displayed = showEnded ? state?.members ?? [] : currentMembers;
  const pagination = useClientPagination(displayed,15);
  return <section className="editor-panel employee-detail-panel">
    <div className="panel-heading"><div><h2>{team.name}</h2><p>{team.departmentName} · {team.code}</p></div><Pencil size={18} /></div>
    <form className="form-grid" key={`${team.name}-${team.isActive}`} onSubmit={(event) => void update(event)}><fieldset className="organization-fields" disabled={saving}>
      <label>Tên team<input name="name" defaultValue={team.name} required maxLength={150} /></label>
      <label>Trạng thái<select name="isActive" defaultValue={String(team.isActive)}><option value="true">Hoạt động</option><option value="false">Ngừng hoạt động</option></select></label>
      <button className="secondary-button" type="submit">Lưu cấu hình</button>
    </fieldset></form>
    {loading && <LoadingState />}
    {error && <Notice kind="error">{error} <button className="table-action" onClick={() => { setLoading(true); setRetry((value) => value + 1); }} type="button">Thử lại</button></Notice>}
    {state && <>
      <form className="form-grid compact" onSubmit={(event) => void add(event)}><fieldset className="organization-fields" disabled={saving || !team.isActive || !team.departmentActive || !!error}>
        <EmployeePicker employees={candidates} value={employeeId} onChange={setEmployeeId} label="Thêm thành viên cùng phòng ban" />
        <div><p className="scope-note">Danh sách do Backend lọc, gồm phân công chính và kiêm nhiệm ở các chi nhánh.</p><button className="primary-button" disabled={!employeeId} type="submit"><Plus size={16} /> Thêm thành viên</button></div>
      </fieldset></form>
      <div className="organization-history-toggle"><label><input checked={showEnded} onChange={(event) => setShowEnded(event.target.checked)} type="checkbox" /> Bao gồm phân công đã kết thúc</label></div>
      {displayed.length === 0 ? <EmptyState title="Chưa có thành viên" description="Thêm nhân viên đang thuộc phòng ban của team. Không tự cấp quyền Leader khi thêm." /> : <>
        <div className="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Chi nhánh trong phòng ban</th><th>Phân công</th><th>Thao tác</th></tr></thead><tbody>{pagination.items.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong><br /><small>{member.employeeCode}</small></td><td>{member.branches.join(', ') || 'Không còn phân công hiện hành'}</td><td><StatusBadge value={member.status === 'ENDED' ? 'INACTIVE' : member.status} /><br /><small>{member.status === 'ENDED' ? `Đã kết thúc · ${formatDate(member.endedAt)}` : member.status === 'INACTIVE' ? 'Team/phòng/nhân viên không hoạt động hoặc không còn thuộc phòng' : `Từ ${formatDate(member.createdAt)}`}</small>{member.endReason && <><br /><small>{member.endReason}</small></>}</td><td>{!member.endedAt && <button className="table-action danger-action" disabled={saving} onClick={() => void end(member)} type="button">Rút thành viên</button>}</td></tr>)}</tbody></table></div><Pagination page={pagination.page} pageSize={pagination.pageSize} total={displayed.length} onPageChange={pagination.setPage} />
      </>}
    </>}
  </section>;
}

function GrantForm({ departments,teams,employees,saving,perform }: { departments: Department[]; teams: OrganizationTeam[]; employees: Employee[]; saving: boolean; perform: Perform }) {
  const [employeeId, setEmployeeId] = useState('');
  const [roleCode, setRoleCode] = useState<'DEPARTMENT_HEAD' | 'TEAM_LEADER'>('DEPARTMENT_HEAD');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [indefinite, setIndefinite] = useState(true);
  const [start] = useState(localNow);
  const [error, setError] = useState('');
  const { request,dialog } = useActionDialog();
  const formRef = useRef<HTMLFormElement>(null);
  const availableTeams = teams.filter((team) => team.departmentId === departmentId);

  const resetSelection = useCallback(() => { setEmployeeId(''); setDepartmentId(''); setTeamId(''); setRoleCode('DEPARTMENT_HEAD'); setIndefinite(true); }, []);
  async function grant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setError('');
    const fields = new FormData(event.currentTarget);
    const from = new Date(String(fields.get('validFrom')));
    const until = indefinite ? null : new Date(String(fields.get('validUntil')));
    if (!Number.isFinite(from.getTime()) || (until && (!Number.isFinite(until.getTime()) || until <= from))) { setError('Thời điểm kết thúc phải sau bắt đầu.'); return; }
    const confirm = await request({ title: 'Cấp quyền quản lý',description: 'Quyền cho phép đọc danh sách tổ chức trong đúng phạm vi được chọn. Không tự cấp quyền Admin, duyệt đơn hoặc chỉnh sửa nghiệp vụ.',confirmLabel: 'Cấp quyền' });
    if (confirm === null) return;
    const payload = { employeeId,roleCode,departmentId: roleCode === 'DEPARTMENT_HEAD' ? departmentId : undefined,teamId: roleCode === 'TEAM_LEADER' ? teamId : undefined,
      appointmentType: fields.get('appointmentType'),validFrom: from.toISOString(),validUntil: until?.toISOString() ?? null,reason: fields.get('reason') };
    if (await perform(() => apiRequest('/organization/grants', { method: 'POST',body: JSON.stringify(payload) }), 'Đã cấp quyền quản lý theo phạm vi và thời hạn.')) { formRef.current?.reset(); resetSelection(); }
  }
  return <details className="editor-panel" open><summary><ShieldCheck size={16} /> Cấp quyền quản lý</summary>
    {error && <Notice kind="error">{error}</Notice>}
    <form className="form-grid" onSubmit={(event) => void grant(event)} ref={formRef}><fieldset className="organization-fields" disabled={saving}>
      <EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId} label="Người được cấp quyền" />
      <label>Vai trò<select value={roleCode} onChange={(event) => { setRoleCode(event.target.value as typeof roleCode); setTeamId(''); }}><option value="DEPARTMENT_HEAD">Trưởng phòng</option><option value="TEAM_LEADER">Leader team</option></select></label>
      <label>Phòng ban<select required value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setTeamId(''); }}><option value="">Chọn phòng ban</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      {roleCode === 'TEAM_LEADER' && <label>Team trong phòng ban<select required value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Chọn team</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.code} · {team.name}</option>)}</select></label>}
      <label>Hình thức bổ nhiệm<select name="appointmentType" defaultValue="OFFICIAL"><option value="OFFICIAL">Chính thức</option><option value="TEMPORARY">Tạm thời</option></select></label>
      <label>Bắt đầu (giờ thiết bị)<input name="validFrom" type="datetime-local" required defaultValue={start} /></label>
      <label>Thời hạn<select value={indefinite ? 'indefinite' : 'bounded'} onChange={(event) => setIndefinite(event.target.value === 'indefinite')}><option value="indefinite">Vô thời hạn</option><option value="bounded">Có thời điểm kết thúc</option></select></label>
      {!indefinite && <label>Kết thúc (giờ thiết bị)<input name="validUntil" type="datetime-local" required /></label>}
      <label>Lý do cấp quyền<textarea name="reason" required maxLength={500} /></label>
      <div><p className="scope-note">Tạm thời/chính thức độc lập với thời hạn. Người quản lý không bắt buộc là thành viên; chỉ Admin được chỉ định.</p><button className="primary-button" type="submit">{saving ? 'Đang lưu…' : 'Cấp quyền'}</button></div>
    </fieldset></form>{dialog}
  </details>;
}
