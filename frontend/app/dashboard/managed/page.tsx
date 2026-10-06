'use client';

import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, Pagination, formatDate } from '@/components/admin-ui';
import { apiRequest, getAdminSession, type PortalAccess } from '@/lib/auth-api';
import type { OrganizationTeam } from '@/lib/organization-api';
import { useClientPagination } from '@/lib/use-client-pagination';

interface DirectoryPerson { id?: string; employeeId?: string; employeeCode: string; fullName: string; branches: string[] }
interface DirectoryScope { key: string; label: string; path: string }
interface Foundation { portal: PortalAccess; scopes: DirectoryScope[] }

async function loadFoundation(): Promise<Foundation> {
  const user = await getAdminSession();
  if (!user.portal) throw new Error('Backend chưa cung cấp thông tin quyền. Vui lòng cập nhật Backend.');
  const teams = await apiRequest<OrganizationTeam[]>('/organization/teams');
  const departments = new Map(user.portal.managementGrants.filter((grant) => grant.roleCode === 'DEPARTMENT_HEAD')
    .map((grant) => [grant.departmentId, grant.departmentName]));
  return { portal: user.portal, scopes: [
    ...Array.from(departments, ([id, name]) => ({ key: `department-${id}`, label: `Phòng ban · ${name}`, path: `/organization/departments/${id}/employees` })),
    ...teams.map((team) => ({ key: `team-${team.id}`, label: `Team · ${team.name} — ${team.departmentName}`, path: `/organization/teams/${team.id}/members` })),
  ] };
}

export default function ManagedPage() {
  const [foundation, setFoundation] = useState<Foundation | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadFoundation().then((value) => {
      if (active) { setFoundation(value); setError(''); setLoading(false); }
    }).catch((caught: unknown) => {
      if (active) { setFoundation(null); setError(caught instanceof Error ? caught.message : 'Không thể kiểm tra phạm vi quản lý.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [version]);

  function reload() { if (loading) return; setLoading(true); setVersion((value) => value + 1); }
  const scope = foundation?.scopes.find((item) => item.key === selected) ?? foundation?.scopes[0];

  return <>
    <PageHeader eyebrow="QUẢN LÝ THEO PHẠM VI" title="Khu vực quản lý của tôi"
      description="Quyền hiện hành do Backend xác định. Chỉ xem thông tin tổ chức trong phạm vi được Admin cấp."
      action={<button className="secondary-button" disabled={loading} onClick={reload} type="button"><RefreshCw size={16} aria-hidden="true" /> Kiểm tra lại quyền</button>} />
    {loading ? <LoadingState /> : error ? <Notice kind="error">{error}</Notice> : foundation && <>
      <Notice><ShieldCheck size={16} aria-hidden="true" /> {foundation.portal.sessionMode === 'WEB_AND_MOBILE'
        ? 'Bạn có thể dùng một phiên Web và một thiết bị Mobile đồng thời. Đăng nhập lại cùng kênh sẽ thay phiên cũ.'
        : 'Tài khoản này đang áp dụng chính sách một phiên hoạt động.'} Web tối đa 24 giờ, không hoạt động 30 phút sẽ hết phiên; Mobile tối đa 30 ngày.</Notice>
      <section className="panel">
        <div className="panel-heading"><div><h2>Quyền đang hiệu lực</h2><p>Đây là quyền quản lý độc lập với membership; không mở quyền Admin.</p></div></div>
        {foundation.portal.managementGrants.length === 0 ? <EmptyState title="Chưa có quyền quản lý theo tổ chức" description="Không tự suy diễn quyền từ chức vụ hoặc thành viên team. Liên hệ Admin để kiểm tra phân quyền." /> :
          <div className="table-wrap"><table><thead><tr><th>Vai trò</th><th>Phạm vi</th><th>Hình thức</th><th>Hiệu lực</th></tr></thead><tbody>
            {foundation.portal.managementGrants.map((grant) => <tr key={grant.id}>
              <td>{grant.roleCode === 'DEPARTMENT_HEAD' ? 'Trưởng phòng' : 'Leader team'}</td>
              <td>{grant.teamName ? `${grant.teamName} · ${grant.departmentName}` : grant.departmentName}</td>
              <td>{grant.appointmentType === 'TEMPORARY' ? 'Tạm thời' : 'Chính thức'}</td>
              <td>{formatDate(grant.validFrom)} → {grant.validUntil ? formatDate(grant.validUntil) : 'Vô thời hạn'}</td>
            </tr>)}
          </tbody></table></div>}
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Nhân sự trong phạm vi</h2><p>Chỉ mã, họ tên và chi nhánh thuộc phạm vi này. Leader không được xem cả phòng.</p></div></div>
        {scope ? <>
          <label className="field"><span>Chọn phòng ban / team</span><select value={scope.key} onChange={(event) => setSelected(event.target.value)}>
            {foundation.scopes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
          <ScopedDirectory key={`${scope.key}-${version}`} scope={scope} />
        </> : <EmptyState title="Không có phạm vi để xem" description="Quyền hết hiệu lực hoặc chưa có team hoạt động. Không có dữ liệu giả được hiển thị." />}
      </section>
      <Notice>Trang này chỉ đọc danh sách tổ chức. Xử lý giải trình tại mục Giải trình hai bước; chỉ người được chỉ định và có quyền hiện hành mới được xác nhận/duyệt.</Notice>
    </>}
  </>;
}

function ScopedDirectory({ scope }: { scope: DirectoryScope }) {
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const pagination = useClientPagination(people ?? [], 10);
  useEffect(() => {
    let active = true;
    apiRequest<DirectoryPerson[]>(scope.path).then((value) => { if (active) { setPeople(value); setError(''); } })
      .catch((caught: unknown) => { if (active) { setPeople(null); setError(caught instanceof Error ? caught.message : 'Không thể tải nhân sự.'); } });
    return () => { active = false; };
  }, [scope.path, version]);
  if (error) return <><Notice kind="error">{error}</Notice><button className="secondary-button" onClick={() => { setError(''); setVersion((value) => value + 1); }} type="button">Thử tải lại</button></>;
  if (!people) return <LoadingState />;
  if (!people.length) return <EmptyState title="Chưa có nhân sự hiện hành" description="Backend không tìm thấy nhân sự còn đủ điều kiện trong phạm vi được chọn." />;
  return <><div className="table-wrap"><table><thead><tr><th>Mã nhân viên</th><th>Họ tên</th><th>Chi nhánh trong phạm vi</th></tr></thead><tbody>
    {pagination.items.map((person) => <tr key={person.employeeId ?? person.id}><td>{person.employeeCode}</td><td>{person.fullName}</td><td>{person.branches.join(', ') || '—'}</td></tr>)}
  </tbody></table></div><Pagination page={pagination.page} pageSize={pagination.pageSize} total={people.length} onPageChange={pagination.setPage} />
    <Notice kind="success">Đã tải {people.length} nhân sự theo quyền hiện hành.</Notice></>;
}
