'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface KpiRow { employeeId: string; employeeCode: string; fullName: string; scheduledDays: number; presentDays: number; businessTripDays: number; leaveDays: number; incompleteDays: number; absentDays: number; reviewDays: number; }
const currentMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);

export default function KpiPage() {
  const [month, setMonth] = useState(currentMonth); const [rows, setRows] = useState<KpiRow[] | null>(null); const [error, setError] = useState('');
  async function load(): Promise<void> { setRows(null); setRows(await apiRequest<KpiRow[]>(`/kpi/monthly?month=${month}`)); }
  useEffect(() => { apiRequest<KpiRow[]>(`/kpi/monthly?month=${currentMonth}`).then(setRows).catch(() => setError('Không thể tải KPI Lite.')); }, []);
  async function filter(event: FormEvent<HTMLFormElement>): Promise<void> { event.preventDefault(); try { await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải KPI.'); } }
  return <div className="module-page"><PageHeader eyebrow="W9 / KPI LITE" title="Chỉ số vận hành tháng" description="Chỉ hiển thị số ngày theo trạng thái để quản lý theo dõi; không tính điểm, lương, thưởng hay phạt." />{error && <Notice kind="error">{error}</Notice>}<form className="toolbar" onSubmit={filter}><label>Tháng<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button className="secondary-button">Xem KPI</button></form>
    {rows === null ? <LoadingState /> : rows.length === 0 ? <EmptyState title="Chưa có KPI" description="KPI Lite được tạo từ lịch làm việc và báo cáo tháng thực tế." /> : <div className="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Ngày lịch</th><th>Có mặt</th><th>Công tác</th><th>Nghỉ duyệt</th><th>Thiếu event</th><th>Vắng</th><th>Cần xem</th></tr></thead><tbody>{rows.map((row) => <tr key={row.employeeId}><td><strong>{row.employeeCode}</strong><br />{row.fullName}</td><td>{row.scheduledDays}</td><td>{row.presentDays}</td><td>{row.businessTripDays}</td><td>{row.leaveDays}</td><td>{row.incompleteDays}</td><td>{row.absentDays}</td><td>{row.reviewDays}</td></tr>)}</tbody></table></div>}
  </div>;
}
