'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, formatDate } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface KpiRow {
  employeeId: string; employeeCode: string; fullName: string; scheduledDays: number; presentDays: number; businessTripDays: number;
  officeDays: number; fieldDays: number; fullWorkdays: number; leaveDays: number; partialLeaveDays: number;
  incompleteDays: number; absentDays: number; reviewDays: number; totalWorkedMinutes: number; totalOvertimeMinutes: number;
}
interface KpiDocument {
  month: string; rows: KpiRow[]; source: 'LIVE' | 'SNAPSHOT'; revision: number | null; lockedAt: string | null; lockedByName: string | null;
  warnings: string[]; versions: Array<{ revision: number; lockedAt: string }>;
  summary: { employeeCount: number; scheduledDays: number; totalWorkedMinutes: number; totalOvertimeMinutes: number; incompleteDays: number; fullWorkdays: number };
}
const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
const hours = (minutes: number) => `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;

export default function KpiPage() {
  const [month, setMonth] = useState(currentMonth), [revision, setRevision] = useState('');
  const [viewQuery, setViewQuery] = useState(`month=${currentMonth}`), [refresh, setRefresh] = useState(0);
  const [document, setDocument] = useState<KpiDocument | null>(null), [loadedQuery, setLoadedQuery] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const params = new URLSearchParams({ month });
  if (revision) params.set('revision', revision);
  const selectedQuery = params.toString();
  const ready = !loading && document !== null && loadedQuery === selectedQuery;
  useEffect(() => {
    let active = true, request = 0;
    async function load(): Promise<void> {
      const current = ++request;
      setLoading(true); setDocument(null); setLoadedQuery(''); setError('');
      try {
        const result = await apiRequest<KpiDocument>(`/kpi/monthly/document?${viewQuery}`);
        if (active && current === request) { setDocument(result); setLoadedQuery(viewQuery); }
      } catch (caught) {
        if (active && current === request) setError(caught instanceof Error ? caught.message : 'Không thể tải KPI Lite.');
      } finally { if (active && current === request) setLoading(false); }
    }
    void load();
    const focus = () => { void load(); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.removeEventListener('focus', focus); };
  }, [viewQuery, refresh]);
  function filter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); if (loading) return;
    setViewQuery(selectedQuery); setRefresh(value => value + 1);
  }
  return <div className="module-page">
    <PageHeader eyebrow="R13 / KPI LITE" title="Chỉ số vận hành tháng" description="Tổng hợp cùng nguồn, cùng phiên bản với báo cáo R12. Chỉ theo dõi trạng thái công, không chấm điểm hoặc tính lương/thưởng/phạt." />
    {error && <Notice kind="error">{error} <button className="secondary-button" type="button" onClick={() => setRefresh(value => value + 1)}>Thử tải lại</button></Notice>}
    <form className="toolbar" onSubmit={filter}>
      <label>Tháng<input type="month" value={month} disabled={loading} onChange={event => { setMonth(event.target.value); setRevision(''); }} /></label>
      <label>Phiên bản dữ liệu<select value={revision} disabled={loading} onChange={event => setRevision(event.target.value)}><option value="">Hiện tại — kỳ mở hoặc bản chốt mới nhất</option>{document?.month === month && document.versions.map(item => <option key={item.revision} value={item.revision}>Bản chốt v{item.revision} · {formatDate(item.lockedAt)}</option>)}</select></label>
      <button className="secondary-button" disabled={loading}>{loading ? 'Đang tải…' : 'Xem KPI'}</button>
    </form>
    {!loading && document && !ready && <Notice kind="info">Bộ lọc đã thay đổi. Bấm Xem KPI để tải đúng tháng và phiên bản; không hiển thị số liệu cũ dưới nhãn tháng mới.</Notice>}
    {loading ? <LoadingState /> : !ready || !document ? null : <>
      <Notice kind="info">Tháng {document.month} · Toàn bộ chi nhánh · {document.source === 'SNAPSHOT' ? `Bản lưu v${document.revision}, chốt bởi ${document.lockedByName} lúc ${formatDate(document.lockedAt)}; không tính lại dữ liệu sống.` : 'Dữ liệu hiện tại để theo dõi/đối soát, chưa phải bản lịch sử đã chốt.'} Chọn cùng tháng/phiên bản tại Báo cáo để đối chiếu.</Notice>
      {(document.warnings ?? []).map(warning => <Notice key={warning} kind="info">{warning}</Notice>)}
      <section className="metric-grid" aria-label="Tổng hợp KPI Lite">
        <div className="metric-card"><p>Nhân viên có dữ liệu</p><strong>{document.summary.employeeCount}</strong><span>{document.summary.scheduledDays} ngày có dữ liệu</span></div>
        <div className="metric-card"><p>Giờ làm thực tế</p><strong>{hours(document.summary.totalWorkedMinutes)}</strong><span>Chưa tự trừ nghỉ trưa hoặc tính lương</span></div>
        <div className="metric-card"><p>OT đã duyệt</p><strong>{hours(document.summary.totalOvertimeMinutes)}</strong><span>Không suy OT từ check-out trễ</span></div>
        <div className="metric-card"><p>Ngày đủ công</p><strong>{document.summary.fullWorkdays}</strong><span>{document.summary.incompleteDays} ngày chưa đủ cặp vào/ra</span></div>
      </section>
      <Notice>“Ngày có dữ liệu” gồm ngày theo lịch và ngày có sự kiện/OT được ghi nhận, không chỉ ngày được phân lịch. Nghỉ một phần không phải số ngày phép quy đổi. Văn phòng/hiện trường có thể trùng ngày nghỉ một phần; không cộng các nhóm thành ngày công. Cảnh báo/điều chỉnh không tự đồng nghĩa vi phạm.</Notice>
      {document.rows.length === 0 ? <EmptyState title="Chưa có dữ liệu KPI trong tháng" description="Không có dòng báo cáo phù hợp. Hệ thống không tự tạo số công hoặc điểm KPI." /> : <div className="table-wrap"><table><thead><tr>
        <th>Nhân viên</th><th>Ngày có dữ liệu</th><th>Hiện diện</th><th>Hiện trường (trạng thái)</th><th>Văn phòng (có cặp)</th><th>Hiện trường (có cặp)</th><th>Đủ công</th><th>Nghỉ cả ngày</th><th>Ngày nghỉ một phần</th><th>Chưa đủ vào/ra</th><th>Vắng</th><th>Cảnh báo / điều chỉnh</th><th>Giờ làm thực tế</th><th>OT đã duyệt</th>
      </tr></thead><tbody>{document.rows.map(row => <tr key={row.employeeId}>
        <td><strong>{row.employeeCode}</strong><br />{row.fullName}</td><td>{row.scheduledDays}</td><td>{row.presentDays}</td><td>{row.businessTripDays}</td><td>{row.officeDays}</td><td>{row.fieldDays}</td><td>{row.fullWorkdays}</td><td>{row.leaveDays}</td><td>{row.partialLeaveDays}</td><td>{row.incompleteDays}</td><td>{row.absentDays}</td><td>{row.reviewDays}</td><td>{hours(row.totalWorkedMinutes)}</td><td>{hours(row.totalOvertimeMinutes)}</td>
      </tr>)}</tbody></table></div>}
    </>}
  </div>;
}
