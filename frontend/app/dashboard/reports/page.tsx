'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
import { apiRequest, apiUrl } from '@/lib/auth-api';

interface ReportRow { employeeId: string; employeeCode: string; fullName: string; departmentName: string | null; workDate: string; checkedInAt: string | null; checkedOutAt: string | null; status: string; riskFlags: string[]; adjustmentCount: number; }
interface Employee { id: string; employeeCode: string; fullName: string; }
interface Department { id: string; name: string; }
const currentMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth); const [employeeId, setEmployeeId] = useState(''); const [departmentId, setDepartmentId] = useState(''); const [employees, setEmployees] = useState<Employee[]>([]); const [departments, setDepartments] = useState<Department[]>([]); const [rows, setRows] = useState<ReportRow[] | null>(null); const [error, setError] = useState('');
  function query(selected = month): string { const params = new URLSearchParams({ month: selected }); if (employeeId) params.set('employeeId', employeeId); if (departmentId) params.set('departmentId', departmentId); return params.toString(); }
  async function load(selected = month): Promise<void> { setRows(null); setRows(await apiRequest<ReportRow[]>(`/reporting/monthly?${query(selected)}`)); }
  useEffect(() => { Promise.all([apiRequest<ReportRow[]>(`/reporting/monthly?month=${currentMonth}`), apiRequest<Employee[]>('/employees'), apiRequest<Department[]>('/employees/lookups/departments')]).then(([reportRows, employeeRows, departmentRows]) => { setRows(reportRows); setEmployees(employeeRows); setDepartments(departmentRows); }).catch(() => setError('Không thể tổng hợp báo cáo tháng.')); }, []);
  async function filter(event: FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); try { await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo.'); } }
  const blockers = rows?.filter((row) => row.status === 'INCOMPLETE').length ?? 0;
  return <div className="module-page"><PageHeader eyebrow="W8 / ĐỐI SOÁT" title="Báo cáo tháng" description="Backend đối chiếu lịch làm việc, attendance, công tác, nghỉ đã duyệt và điều chỉnh có audit." action={blockers === 0 ? <a className="secondary-button export-link" href={`${apiUrl}/reporting/monthly/export?${query()}`}>Xuất Excel</a> : <span className="secondary-button disabled-button" aria-disabled="true">Chưa thể xuất final</span>} />{error && <Notice kind="error">{error}</Notice>}{rows && blockers > 0 && <Notice kind="error">Còn {blockers} ngày thiếu check-out. Cần đối soát trước khi phát hành bảng công cuối.</Notice>}
    <form className="toolbar" onSubmit={filter}><label>Tháng<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label>Phòng ban<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Tất cả</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nhân viên<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Tất cả</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeCode} · {item.fullName}</option>)}</select></label><button className="secondary-button">Tổng hợp</button></form>
    {rows === null ? <LoadingState /> : rows.length === 0 ? <EmptyState title="Chưa có dữ liệu báo cáo" description="Cần phân lịch làm việc cho nhân viên; hệ thống không tự tạo số liệu attendance." /> : <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Phòng ban</th><th>Vào</th><th>Ra</th><th>Trạng thái</th><th>Cảnh báo / audit</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.employeeId}-${row.workDate}`}><td>{row.workDate}</td><td><strong>{row.employeeCode}</strong><br />{row.fullName}</td><td>{row.departmentName ?? '—'}</td><td>{formatDate(row.checkedInAt)}</td><td>{formatDate(row.checkedOutAt)}</td><td><StatusBadge value={row.status} /></td><td>{row.riskFlags.join(', ') || '—'}{row.adjustmentCount ? ` · ${row.adjustmentCount} điều chỉnh` : ''}</td></tr>)}</tbody></table></div>}
  </div>;
}
