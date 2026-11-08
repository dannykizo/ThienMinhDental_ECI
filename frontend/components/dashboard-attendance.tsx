'use client';

import Link from 'next/link';
import { ArrowUpRight, ChartNoAxesColumn, CircleAlert, MapPin, RefreshCw } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { apiRequest } from '@/lib/auth-api';

interface AttendanceRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  workDate: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  attendanceType: string | null;
}
interface AttendanceDocument {
  rows: AttendanceRow[];
  source: 'LIVE' | 'SNAPSHOT';
  revision: number | null;
  warnings?: string[];
}
interface DayCount { date: string; office: number; field: number; other: number; }

function dateBefore(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00+07:00`);
  value.setUTCDate(value.getUTCDate() - offset);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(value);
}
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(`${date}T12:00:00+07:00`));
}
function clock(value: string | null): string {
  return value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value)) : '—';
}
function hasAttendance(row: AttendanceRow): boolean { return Boolean(row.checkedInAt || row.checkedOutAt); }
function countDay(date: string, rows: AttendanceRow[]): DayCount {
  const recorded = rows.filter(row => row.workDate === date && hasAttendance(row));
  return {
    date,
    office: recorded.filter(row => row.attendanceType === 'OFFICE').length,
    field: recorded.filter(row => row.attendanceType === 'BUSINESS_TRIP').length,
    other: recorded.filter(row => row.attendanceType !== 'OFFICE' && row.attendanceType !== 'BUSINESS_TRIP').length,
  };
}

export function DashboardAttendancePanels({ workDate, refreshKey, enabled, children }: { workDate: string; refreshKey: string; enabled: boolean; children: ReactNode }) {
  const [documents, setDocuments] = useState<AttendanceDocument[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [range, setRange] = useState<'week' | 'month'>('week');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const months = [...new Set([workDate.slice(0, 7), dateBefore(workDate, 6).slice(0, 7)])];
    void Promise.all(months.map(month => apiRequest<AttendanceDocument>(`/reporting/monthly/document?month=${month}`)))
      .then(data => { if (active) setDocuments(data); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Chưa thể tải dữ liệu biểu đồ.'); });
    return () => { active = false; };
  }, [workDate, refreshKey, attempt, enabled]);

  const rows = documents?.flatMap(document => document.rows) ?? [];
  const today = rows.filter(row => row.workDate === workDate && hasAttendance(row));
  const days = range === 'week' ? 7 : Number(workDate.slice(8, 10));
  const counts = Array.from({ length: days }, (_, index) => countDay(dateBefore(workDate, days - index - 1), rows));
  const maximum = Math.max(4, Math.ceil(Math.max(0, ...counts.map(day => day.office + day.field + day.other)) / 4) * 4);
  const current = countDay(workDate, rows);
  const segments = [
    { label: 'Văn phòng', count: current.office, className: 'office', color: '#5e2d91' },
    { label: 'Hiện trường', count: current.field, className: 'field', color: '#0d9488' },
    { label: 'Chưa phân loại', count: current.other, className: 'other', color: '#94a3b8' },
  ];
  const recent = [...today].sort((a, b) => (b.checkedOutAt || b.checkedInAt || '').localeCompare(a.checkedOutAt || a.checkedInAt || '') || a.employeeCode.localeCompare(b.employeeCode)).slice(0, 5);
  const source = documents?.[0];
  const warningCount = documents?.reduce((total, document) => total + (document.warnings?.length ?? 0), 0) ?? 0;
  const loadState = error ? <div className="db-panel-state" role="alert"><CircleAlert size={26} aria-hidden="true" /><strong>Chưa thể tải chi tiết chấm công</strong><p>{error}</p><button className="secondary-button" type="button" onClick={() => { setError(''); setDocuments(null); setAttempt(value => value + 1); }}><RefreshCw size={15} />Thử lại</button></div> : documents === null ? <div className="db-panel-state" role="status"><span className="route-loader" /><p>Đang đọc dữ liệu báo cáo…</p></div> : null;

  if (!enabled) return <>{children}</>;

  return <>
    <section className="db-panel db-trend" aria-labelledby="db-trend-title">
      <header className="db-panel-heading"><div><p className="db-kicker">NHỊP VẬN HÀNH</p><h2 id="db-trend-title">Chấm công theo ngày</h2></div><label className="db-range"><span className="visually-hidden">Khoảng thời gian biểu đồ</span><select value={range} onChange={event => setRange(event.target.value as 'week' | 'month')}><option value="week">7 ngày gần nhất</option><option value="month">Trong tháng</option></select></label></header>
      {loadState ?? <>
        <div className="db-chart-caption"><span>Nhân sự có giờ vào hoặc ra</span><div className="db-legend"><span><i className="db-office" />Văn phòng</span><span><i className="db-field" />Hiện trường</span>{counts.some(day => day.other > 0) && <span><i className="db-other" />Chưa phân loại</span>}</div></div>
        <div className="db-chart-scroll" tabIndex={0} aria-label="Biểu đồ chấm công, cuộn ngang khi cần">
          <div className={`db-chart${range === 'month' ? ' is-month' : ''}`} style={{ '--db-days': counts.length } as CSSProperties}>
            <div className="db-chart-axis" aria-hidden="true">{[4, 3, 2, 1, 0].map(tick => <span key={tick}>{maximum * tick / 4}</span>)}</div>
            <div className="db-chart-plot"><div className="db-chart-grid" aria-hidden="true">{[0, 1, 2, 3, 4].map(tick => <i key={tick} />)}</div><div className="db-chart-days">
              {counts.map(day => {
                const total = day.office + day.field + day.other;
                return <div className={`db-chart-day${day.date === workDate ? ' is-today' : ''}`} key={day.date} tabIndex={0} role="img" aria-label={`${dayLabel(day.date)}: ${day.office} văn phòng, ${day.field} hiện trường, ${day.other} chưa phân loại`}>
                  <span className="db-chart-tooltip">{dayLabel(day.date)}<strong>{total} nhân sự có vào/ra</strong><small>{day.office} văn phòng · {day.field} hiện trường{day.other > 0 ? ` · ${day.other} chưa phân loại` : ''}</small></span>
                  <span className="db-chart-stack" style={{ height: `${total / maximum * 100}%` }}>{segments.map(segment => {
                    const count = day[segment.className as 'office' | 'field' | 'other'];
                    return count > 0 ? <i key={segment.className} className={`db-${segment.className}`} style={{ flexGrow: count }} /> : null;
                  })}</span><span className="db-chart-day-label">{dayLabel(day.date)}</span>
                </div>;
              })}
            </div></div>
          </div>
        </div>
        <p className="db-panel-footnote">{counts.every(day => day.office + day.field + day.other === 0) ? 'Chưa có giờ vào/ra trong khoảng này. Không tự suy ra vắng mặt.' : 'Mỗi nhân viên được đếm một lần/ngày; có vào/ra chưa đồng nghĩa đủ công.'}</p>
        {warningCount > 0 && <details className="db-data-warning"><summary><CircleAlert size={14} />{warningCount} lưu ý về nguồn báo cáo</summary>{documents?.map((document, index) => document.warnings?.map((warning, warningIndex) => <p key={`${index}-${warningIndex}`}>{warning}</p>))}</details>}
      </>}
    </section>

    {children}

    <section className="db-panel db-recent" aria-labelledby="db-recent-title">
      <header className="db-panel-heading"><div><p className="db-kicker">TRONG NGÀY</p><h2 id="db-recent-title">Chấm công gần đây</h2></div><Link href="/dashboard/attendance" className="db-text-link">Xem nhật ký<ArrowUpRight size={15} aria-hidden="true" /></Link></header>
      {loadState ?? (recent.length === 0 ? <div className="db-panel-state"><ClockEmpty /><strong>Chưa có giờ vào/ra hôm nay</strong><p>Dữ liệu mới sẽ hiện sau khi cập nhật.</p></div> : <div className="db-attendance-scroll" tabIndex={0} aria-label="Bảng chấm công gần đây, cuộn ngang khi cần"><table className="db-attendance-table"><thead><tr><th>Nhân viên</th><th>Hình thức</th><th>Giờ vào</th><th>Giờ ra</th></tr></thead><tbody>{recent.map(row => <tr key={row.employeeId}>
        <td><span className="db-person"><span className="db-avatar" aria-hidden="true">{row.fullName.trim().split(/\s+/).slice(-2).map(part => part[0]).join('')}</span><span><strong>{row.fullName}</strong><small>{row.employeeCode}</small></span></span></td>
        <td><span className={`db-mode ${row.attendanceType === 'OFFICE' ? 'db-office' : row.attendanceType === 'BUSINESS_TRIP' ? 'db-field' : 'db-other'}`}>{row.attendanceType === 'OFFICE' ? 'Văn phòng' : row.attendanceType === 'BUSINESS_TRIP' ? 'Hiện trường' : 'Chưa phân loại'}</span></td><td>{clock(row.checkedInAt)}</td><td>{row.checkedOutAt ? clock(row.checkedOutAt) : <span className="db-no-checkout">Chưa có</span>}</td>
      </tr>)}</tbody></table></div>)}
      {documents && !error && <p className="db-panel-footnote">Tối đa 5 người, xếp theo giờ vào/ra hiệu lực gần nhất · +07:00. Không có giờ ra có thể đang làm việc.</p>}
    </section>

    <section className="db-panel db-format" aria-labelledby="db-format-title">
      <header className="db-panel-heading"><div><p className="db-kicker">HÌNH THỨC LÀM VIỆC</p><h2 id="db-format-title">Văn phòng & hiện trường</h2></div><span className="db-small-icon"><MapPin size={19} aria-hidden="true" /></span></header>
      {loadState ?? <><div className="db-format-body"><div className="db-donut" role="img" aria-label={`Hôm nay: ${current.office} văn phòng, ${current.field} hiện trường, ${current.other} chưa phân loại`} style={{ background: today.length ? `conic-gradient(#5e2d91 0 ${current.office / today.length * 100}%, #0d9488 ${current.office / today.length * 100}% ${(current.office + current.field) / today.length * 100}%, #94a3b8 0)` : '#eeeaf3' }}><span><strong>{today.length}</strong><small>Có giờ vào/ra</small></span></div><div className="db-format-legend">{segments.filter(segment => segment.className !== 'other' || segment.count > 0).map(segment => <div key={segment.className}><i className={`db-${segment.className}`} /><span>{segment.label}</span><strong>{segment.count}</strong></div>)}</div></div><p className="db-panel-footnote">Chỉ phân loại các ngày nhân sự có giờ vào/ra hôm nay; không phải tỷ lệ hiện diện trên tổng nhân sự.</p><span className="db-report-source">{source?.source === 'SNAPSHOT' ? `Nguồn hôm nay: bản chốt v${source.revision}` : 'Nguồn hôm nay: báo cáo tạm tính'}</span></>}
    </section>
  </>;
}

function ClockEmpty() { return <ChartNoAxesColumn size={30} strokeWidth={1.3} aria-hidden="true" />; }
