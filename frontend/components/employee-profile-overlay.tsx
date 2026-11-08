'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, ChevronDown, Clock3, Copy, FileText, History, KeyRound, Network, RefreshCw, Search, ShieldCheck, ShieldAlert, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { StatusBadge } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';
import type { ManagementGrant } from '@/lib/organization-api';
import { PortraitCard, PortraitImage, prepareEmployeePortrait, saveEmployeePortrait, type PortraitDraft, type PortraitMetadata } from '@/components/employee-portrait';
import { useActionDialog } from '@/components/use-action-dialog';
import { useEmployeeProfileMotion } from '@/components/employee-profile-motion';

interface Person { id: string; employeeCode: string; fullName: string; isActive: boolean; }
interface Assignment { id: string; branchName: string; departmentName: string; positionName?: string; managerName?: string; isPrimary: boolean; effectiveFrom?: string; effectiveTo?: string; }
interface Profile extends Person {
  employeeType: string; phone?: string; hireDate?: string; employmentEndDate?: string; employmentStatusReason?: string;
  department?: { name: string }; position?: { name: string }; accountRoles: string[]; scopeBranchIds: string[]; organizationAssignments: Assignment[];
}
interface Account { account: { username: string; isActive: boolean } | null; }
interface Report {
  rows: { workDate: string; attendanceType: string | null; checkedInAt: string | null; checkedOutAt: string | null; status: string; riskFlags: string[]; adjustmentCount: number; workedMinutes: number; requiredWorkMinutes: number; overtimeMinutes: number; isFullWorkday: boolean }[];
  summary: { scheduledDays: number; fullWorkdays: number; totalWorkedMinutes: number; totalOvertimeMinutes: number; reviewDays: number; officeDays: number; fieldDays: number; incompleteDays: number; leaveDays: number };
  period: { status: string }; source: 'LIVE' | 'SNAPSHOT'; revision: number | null; warnings?: string[];
}
interface Balance { employeeId: string; policyId: string; policyName: string; initialized: boolean; dayMinutes: number; entitlementMinutes: number; carryOverMinutes: number; adjustmentMinutes: number; approvedMinutes: number; pendingMinutes: number; availableMinutes: number; }
interface RequestItem {
  id: string; employeeId: string; status: string; reason?: string; workDate?: string; startDate?: string; endDate?: string;
  policyName?: string; requestedMinutes?: number; workContent?: string; requestNote?: string; responseText?: string | null;
  evidenceImageReference?: string | null; approvalStage?: string | null; leaderName?: string | null; headName?: string | null;
  confirmedByName?: string | null; reviewedByName?: string | null; reviewNote?: string | null;
}
interface Trip { id: string; code: string; siteName: string; customerName?: string; content: string; startAt: string; endAt: string; status: string; members: { employeeId: string; status: string; startedAt: string | null; completedAt: string | null }[]; }
interface Discipline { id: string; employeeId: string; actionType: string; title: string; reason: string; decision: string; status: string; effectiveFrom: string; effectiveTo: string | null; issuedByName: string | null; revocationReason: string | null; }
interface Audit { events: { id: string; action: string; actorName: string; createdAt: string }[]; organizationAssignments: Assignment[]; }
interface Route { employeeId: string; teamName: string; leaderName: string; headName: string; version: number; }
type Resource<T> = { data?: T; error?: string; loading: boolean };
export type EmployeeProfileAction = 'edit' | 'account' | 'history' | 'status' | 'delete';

// Keyed reads hide old data immediately, and ignore late responses after switching people.
function useProfileRead<T>(path: string, revision: number): Resource<T> {
  const key = `${revision}:${path}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    let active = true;
    void apiRequest<T>(path).then(data => { if (active) setState({ key, data }); }).catch((error: unknown) => {
      if (active) setState({ key, error: error instanceof Error ? error.message : 'Không thể tải dữ liệu.' });
    });
    return () => { active = false; };
  }, [path, key]);
  return state?.key === key ? { ...state, loading: false } : { loading: true };
}

const roles: Record<string, string> = { ADMIN: 'Admin', EMPLOYEE: 'Nhân viên', CHIEF_ACCOUNTANT: 'Kế toán trưởng', AREA_MANAGER: 'Quản lý khu vực', MANAGER: 'Quản lý', TEAM_LEADER: 'Leader', DEPARTMENT_HEAD: 'Trưởng phòng' };
const stages: Record<string, string> = { WAITING_ROUTING: 'Chờ xử lý tuyến', LEADER_CONFIRMATION: 'Chờ Leader xác nhận', HEAD_APPROVAL: 'Chờ Trưởng phòng duyệt', COMPLETED: 'Đã kết thúc xử lý' };
const actions: Record<string, string> = { CREATED: 'Tạo hồ sơ', UPDATED: 'Cập nhật hồ sơ', DEACTIVATED: 'Ngừng làm việc', REACTIVATED: 'Khôi phục hoạt động', PASSWORD_RESET: 'Đặt lại mật khẩu', PHOTO_UPDATED: 'Cập nhật ảnh chân dung', PHOTO_REMOVED: 'Gỡ ảnh chân dung' };
const types: Record<string, string> = { OFFICE: 'Văn phòng', TECHNICAL: 'Kỹ thuật / Hiện trường' };
const grantStates: Record<string, string> = { ACTIVE: 'Có hiệu lực', SCHEDULED: 'Chưa đến hạn', EXPIRED: 'Hết hạn', REVOKED: 'Đã thu hồi', INACTIVE: 'Không hoạt động' };
function date(value?: string | null, time = false): string {
  if (!value) return 'Chưa có';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', time ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' } : { dateStyle: 'short', timeZone: 'Asia/Bangkok' }).format(parsed);
}
function clock(value: string | null): string { return value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value)) : '—'; }
function duration(minutes: number): string { return `${minutes < 0 ? '−' : ''}${Math.floor(Math.abs(minutes) / 60)}h${Math.abs(minutes) % 60 ? ` ${Math.abs(minutes) % 60}p` : ''}`; }
function ReadState<T>({ value, children }: { value: Resource<T>; children: (data: T) => ReactNode }) {
  if (value.loading) return <div className="ep-loading" role="status"><span /><span /><span /><small>Đang tải thông tin…</small></div>;
  if (value.error) return <p className="ep-error" role="alert">Chưa tải được: {value.error} Dùng nút Tải lại hồ sơ để thử lại.</p>;
  if (value.data === undefined) return null;
  return children(value.data);
}
function Section({ number, icon, title, note, children }: { number: string; icon: ReactNode; title: string; note?: string; children: ReactNode }) {
  return <section id={`ep-section-${number}`} className="ep-section"><header className="ep-section-heading"><span className="ep-section-icon" aria-hidden="true">{icon}</span><div><span className="ep-kicker">{number} / HỒ SƠ NHÂN SỰ</span><h3>{title}</h3>{note && <p>{note}</p>}</div></header>{children}</section>;
}
function Empty({ children }: { children: ReactNode }) { return <p className="ep-empty">{children}</p>; }
function Requests({ title, value, employeeId }: { title: string; value: Resource<RequestItem[]>; employeeId: string }) {
  return <div className="ep-card"><h4>{title}</h4><ReadState value={value}>{data => {
    const rows = data.filter(row => row.employeeId === employeeId);
    return rows.length ? <div className="ep-records">{rows.map(row => <article key={row.id} className="ep-record"><div className="ep-record-heading"><strong>{row.policyName ?? date(row.workDate ?? row.startDate)}</strong><StatusBadge value={row.status} /></div>
      {row.policyName && <p className="ep-muted">{date(row.startDate)}{row.endDate !== row.startDate ? ` – ${date(row.endDate)}` : ''}</p>}
      {row.requestedMinutes !== undefined && <span className="ep-chip">Đề nghị {duration(row.requestedMinutes)}</span>}
      <p>{row.workContent ?? row.requestNote ?? row.reason ?? 'Chưa có nội dung'}</p>
      {row.workContent && row.reason && <p className="ep-muted">Lý do: {row.reason}</p>}
      {row.responseText && <p>Phản hồi: {row.responseText}</p>}
      {row.evidenceImageReference && <span className="ep-chip">Có minh chứng</span>}
      {row.approvalStage && <p className="ep-muted">{stages[row.approvalStage] ?? row.approvalStage}</p>}
      {(row.confirmedByName || row.reviewedByName) && <p className="ep-muted">{row.confirmedByName && `Xác nhận: ${row.confirmedByName}. `}{row.reviewedByName && `Quyết định: ${row.reviewedByName}.`}</p>}
      {row.reviewNote && <p className="ep-muted">Ghi chú xử lý: {row.reviewNote}</p>}
    </article>)}</div> : <Empty>Chưa có {title.toLocaleLowerCase('vi')} của nhân viên.</Empty>;
  }}</ReadState></div>;
}

function jumpToProfileSection(number: string): void {
  const section = document.getElementById(`ep-section-${number}`), scroll = section?.closest<HTMLElement>('.ep-body');
  if (!section || !scroll) return;
  // Reveal translates/scales the card, but navigation must use its untransformed layout.
  let top = 0, node: HTMLElement | null = section;
  while (node && node !== scroll) { top += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  if (node !== scroll) top = section.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  scroll.scrollTo({ top: top - 20, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function ReportRing({ data }: { data: Report }) {
  const { fullWorkdays, scheduledDays, officeDays, fieldDays, leaveDays } = data.summary;
  const ratio = scheduledDays > 0 ? Math.min(1, fullWorkdays / scheduledDays) : 0;
  const percent = scheduledDays > 0 ? Math.round(ratio * 100) : 0;

  return <>
    <div className="ep-work-ring" role="img" aria-label={scheduledDays > 0 ? `${fullWorkdays} ngày đủ công trên ${scheduledDays} ngày theo lịch, ${percent}%` : 'Chưa có lịch báo cáo'}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {Array.from({ length: 84 }, (_, i) => {
          const isFilled = i / 84 < ratio;
          return <line
            key={i}
            x1="100"
            x2="100"
            y1="12"
            y2={i % 7 === 0 ? '36' : '30'}
            transform={`rotate(${(i * 360) / 84} 100 100)`}
            style={{ '--ep-tick': i } as CSSProperties}
            className={`ep-ring-tick ${isFilled ? 'is-complete' : ''}`}
          />;
        })}
      </svg>
      <div className="ep-ring-center">
        <strong>{scheduledDays ? fullWorkdays : '—'}</strong>
        <span>{scheduledDays ? `/ ${scheduledDays} ngày (${percent}%)` : 'Chưa có lịch báo cáo'}</span>
        {scheduledDays > 0 && percent >= 100 && (
          <span className="ep-full-rate-pill"><Sparkles size={11} /> Đủ 100% công</span>
        )}
      </div>
    </div>
    <div className="ep-work-legend" role="group" aria-label="Các chỉ số ngày độc lập">
      <div className="ep-legend-pill">
        <span><i className="ep-dot-office" />Văn phòng</span>
        <strong>{officeDays}<small> ngày</small></strong>
      </div>
      <div className="ep-legend-pill">
        <span><i className="ep-dot-field" />Hiện trường</span>
        <strong>{fieldDays}<small> ngày</small></strong>
      </div>
      <div className="ep-legend-pill">
        <span><i className="ep-dot-leave" />Nghỉ cả ngày</span>
        <strong>{leaveDays}<small> ngày</small></strong>
      </div>
    </div>
    <small className="ep-card-footnote">Vòng tròn: ngày đủ công / ngày theo lịch.<br />Các chỉ số bên dưới độc lập, không cộng gộp.</small>
  </>;
}

function BentoRequests({ employeeId, leave, overtime, explanations }: { employeeId: string; leave: Resource<RequestItem[]>; overtime: Resource<RequestItem[]>; explanations: Resource<RequestItem[]> }) {
  return <article className="ep-bento-requests ep-bento-card">
    <div className="ep-bento-title">
      <h3>Đơn từ</h3>
      <button className="ep-mini-link" type="button" aria-label="Xem chi tiết đơn từ" onClick={() => jumpToProfileSection('03')}><ArrowUpRight size={17} /></button>
    </div>
    <p className="ep-bento-subtitle">Theo dõi từng bước xử lý</p>
    <div className="ep-request-summary">{[
      { title: 'Nghỉ phép', icon: <CalendarDays size={20} />, value: leave },
      { title: 'Tăng ca / OT', icon: <Clock3 size={20} />, value: overtime },
      { title: 'Giải trình', icon: <FileText size={20} />, value: explanations },
    ].map(group => <div key={group.title} className="ep-request-summary-item">
      <span className="ep-request-symbol">{group.icon}</span>
      <div>
        <h4>{group.title}</h4>
        <ReadState value={group.value}>{data => {
          const rows = data.filter(row => row.employeeId === employeeId);
          const pending = rows.filter(row => row.status === 'SUBMITTED' || row.status === 'REQUESTED').length;
          return <>
            <p>{rows.length ? `${rows.length} đơn đã ghi nhận` : 'Chưa có đơn'}</p>
            <span className={pending ? 'ep-pending-pill is-pulsing' : 'ep-quiet-pill'}>{pending ? `${pending} chờ xử lý` : 'Không có đơn chờ'}</span>
          </>;
        }}</ReadState>
      </div>
    </div>)}</div>
    <button className="ep-bento-bottom-link" type="button" onClick={() => jumpToProfileSection('03')}>Nội dung & người phê duyệt<ArrowRight size={16} /></button>
  </article>;
}

function WorkTimelineChart({ report, month }: { report: Resource<Report>; month: string }) {
  const [hoveredRow, setHoveredRow] = useState<Report['rows'][0] | null>(null);

  return (
    <article className="ep-bento-card ep-bento-chart">
      <div className="ep-bento-title">
        <div>
          <h3>Dòng thời gian làm việc</h3>
          <p>Giờ thực tế theo từng ngày · {month.split('-').reverse().join('/')}</p>
        </div>
        <span className="ep-chart-key">
          <i className="ep-dot-office" />Văn phòng
          <i className="ep-dot-field" />Hiện trường
        </span>
      </div>
      <ReadState value={report}>{data => {
        const max = Math.max(1, ...data.rows.flatMap(row => [row.workedMinutes, row.requiredWorkMinutes]));
        const hasData = data.rows.some(row => row.workedMinutes > 0);
        if (!hasData) {
          return (
            <div className="ep-chart-empty">
              <Clock3 size={30} strokeWidth={1} />
              <strong>Chưa có giờ làm được ghi nhận</strong>
              <span>Biểu đồ sẽ xuất hiện khi tháng có dữ liệu thực tế.</span>
            </div>
          );
        }

        return (
          <div className="ep-chart-container">
            {hoveredRow && (
              <div className="ep-bar-floating-tooltip" role="tooltip">
                <div className="ep-bft-header">
                  <strong>{date(hoveredRow.workDate)}</strong>
                  <span className={`ep-bft-badge ${hoveredRow.attendanceType === 'BUSINESS_TRIP' ? 'is-field' : 'is-office'}`}>
                    {hoveredRow.attendanceType === 'BUSINESS_TRIP' ? 'Hiện trường' : 'Văn phòng'}
                  </span>
                </div>
                <div className="ep-bft-body">
                  <span>Thời gian: <strong>{duration(hoveredRow.workedMinutes)}</strong></span>
                  {hoveredRow.overtimeMinutes > 0 && <span className="ep-bft-ot">+{duration(hoveredRow.overtimeMinutes)} OT</span>}
                </div>
                <div className="ep-bft-times">
                  Vào: {clock(hoveredRow.checkedInAt)} · Ra: {clock(hoveredRow.checkedOutAt)}
                </div>
              </div>
            )}
            <div className={`ep-bars${hoveredRow ? ' has-hovered-bar' : ''}`} role="group" aria-label="Biểu đồ giờ làm từng ngày">
              {data.rows.map((row, i) => {
                const isHovered = hoveredRow?.workDate === row.workDate;
                return (
                  <button
                    type="button"
                    key={row.workDate}
                    className={`ep-bar-item${isHovered ? ' is-active' : ''}`}
                    title={`${date(row.workDate)} · ${duration(row.workedMinutes)}`}
                    aria-label={`${date(row.workDate)}: ${duration(row.workedMinutes)}, xem chi tiết công`}
                    onMouseEnter={() => setHoveredRow(row)}
                    onMouseLeave={() => setHoveredRow(curr => curr?.workDate === row.workDate ? null : curr)}
                    onClick={() => {
                      const details = document.querySelector<HTMLDetailsElement>('.ep-details');
                      if (details) details.open = true;
                      jumpToProfileSection('02');
                    }}
                  >
                    <span
                      className={row.attendanceType === 'BUSINESS_TRIP' ? 'is-field' : ''}
                      style={{ height: `${Math.max(4, (row.workedMinutes / max) * 100)}%`, '--ep-bar': i } as CSSProperties}
                    />
                    <small>{Number(row.workDate.slice(-2))}</small>
                  </button>
                );
              })}
            </div>
            <p className="ep-chart-footnote">Rà chuột lên từng ngày để xem nhanh giờ vào/ra và OT. Nhấp vào cột để nhảy xuống bảng công chi tiết.</p>
          </div>
        );
      }}</ReadState>
    </article>
  );
}

function ProfileBento({ person, employeeId, month, setMonth, report, leave, overtime, explanations, history, account, photoVersion, photoDraft, photoBusy, onChoosePhoto, onSavePhoto, onCancelPhoto, onRemovePhoto, onAction }: {
  person: Profile; employeeId: string; month: string; setMonth: (month: string) => void; report: Resource<Report>;
  leave: Resource<RequestItem[]>; overtime: Resource<RequestItem[]>; explanations: Resource<RequestItem[]>; history: Resource<Audit>; account: Resource<Account>;
  photoVersion?: string; photoDraft: PortraitDraft | null; photoBusy: boolean; onChoosePhoto: (file: File) => void; onSavePhoto: () => void; onCancelPhoto: () => void; onRemovePhoto: () => void; onAction: (action: EmployeeProfileAction, id: string) => void;
}) {
  const primary = person.organizationAssignments.find(a => a.isPrimary);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState(false), [copyError, setCopyError] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null), copyAlive = useRef(true), copyLock = useRef(false);
  const copyErrorId = useId();
  useEffect(() => {
    copyAlive.current = true;
    return () => { copyAlive.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);
  const copyText = async (text: string, label: string) => {
    if (copyLock.current || !text) return;
    copyLock.current = true; setCopyBusy(true); setCopiedField(null); setCopyError('');
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(text);
      if (!copyAlive.current) return;
      setCopiedField(label);
      copyTimer.current = setTimeout(() => setCopiedField(null), 1800);
    } catch {
      if (copyAlive.current) setCopyError('Chưa sao chép được. Bạn có thể chọn và chép tên đăng nhập trong phần Tài khoản bên dưới.');
    } finally {
      copyLock.current = false;
      if (copyAlive.current) setCopyBusy(false);
    }
  };

  return <section className="ep-overview" aria-label="Tổng quan nhân viên">
    <div className="ep-overview-heading">
      <div>
        <p className="ep-overview-eyebrow"><Sparkles size={13} />THIÊN MINH / NHÂN SỰ</p>
        <h3>Hồ sơ<span> · {person.fullName}</span></h3>
        <p>{primary?.departmentName ?? person.department?.name ?? 'Chưa phân phòng ban'} · {types[person.employeeType] ?? person.employeeType}</p>
      </div>
      <label className="ep-month-control">
        <CalendarDays size={16} />
        <span className="ep-visually-hidden">Tháng báo cáo</span>
        <input aria-label="Tháng báo cáo" type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value); }} />
      </label>
    </div>
    <div className="ep-bento">
      <div className="ep-bento-person">
        <PortraitCard employeeId={employeeId} name={person.fullName} code={person.employeeCode} position={primary?.positionName ?? person.position?.name ?? types[person.employeeType] ?? person.employeeType} active={person.isActive} version={photoVersion} draft={photoDraft} busy={photoBusy} onChoose={onChoosePhoto} onSave={onSavePhoto} onCancel={onCancelPhoto} onRemove={onRemovePhoto} onEdit={() => onAction('edit', person.id)} />
        <ReadState value={report}>{data => <div className="ep-mini-stats">
          <article><span><Clock3 size={15} />Giờ làm</span><strong>{duration(data.summary.totalWorkedMinutes)}</strong><small>Thực tế trong tháng</small></article>
          <article><span><Check size={15} />OT đã duyệt</span><strong>{duration(data.summary.totalOvertimeMinutes)}</strong><small>Không tự tính từ giờ về</small></article>
        </div>}</ReadState>
        <article className="ep-bento-card ep-bento-organization">
          <div className="ep-bento-title"><h3>Đơn vị công tác</h3><Network size={17} /></div>
          <p>{primary?.departmentName ?? person.department?.name ?? 'Chưa phân phòng ban'}</p>
          <span>{primary?.branchName ?? 'Chưa phân chi nhánh'}</span>
          <div><CalendarDays size={14} /><small>Gia nhập: {date(person.hireDate)}</small></div>
        </article>
      </div>
      <BentoRequests employeeId={employeeId} leave={leave} overtime={overtime} explanations={explanations} />
      <article className="ep-bento-card ep-bento-work">
        <div className="ep-bento-title"><h3>Nhịp làm việc</h3><span className="ep-tiny-label">{month.split('-').reverse().join(' / ')}</span></div>
        <ReadState value={report}>{data => <ReportRing data={data} />}</ReadState>
      </article>
      <aside className="ep-bento-aside">
        <article className="ep-bento-card ep-bento-review">
          <div className="ep-bento-title"><h3>Cần đối soát</h3><ShieldCheck size={18} /></div>
          <ReadState value={report}>{data => data.summary.reviewDays === 0 && data.summary.incompleteDays === 0 ? (
            <div className="ep-review-perfect">
              <div className="ep-perfect-shield">
                <ShieldCheck size={22} className="ep-sparkle-icon" />
                <strong>Chưa phát hiện cảnh báo</strong>
              </div>
              <p>Theo dữ liệu hiện có của kỳ {month.split('-').reverse().join('/')}. Vẫn cần kiểm tra tính đầy đủ trước khi chốt.</p>
              <button type="button" className="ep-bento-action-link" onClick={() => jumpToProfileSection('02')}>
                Xem bảng công chi tiết <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="ep-review-number is-alert">
                <strong>{data.summary.reviewDays}</strong>
                <span>ngày có cảnh báo<br />hoặc đã điều chỉnh</span>
              </div>
              <div className="ep-review-footer">
                <span><i className="ep-dot-alert" />Thiếu chấm công</span>
                <strong>{data.summary.incompleteDays} ngày</strong>
              </div>
              <button type="button" className="ep-review-action-btn" onClick={() => jumpToProfileSection('02')}>
                Xem bảng công chi tiết <ArrowRight size={14} />
              </button>
            </>
          )}</ReadState>
        </article>
        <article className="ep-bento-card ep-bento-history">
          <div className="ep-bento-title"><h3>Dấu mốc hồ sơ</h3><History size={17} /></div>
          <ReadState value={history}>{data => data.events.length ? <ol>{data.events.slice(0, 4).map(event => <li key={event.id}><span><Check size={12} /></span><div><strong>{actions[event.action] ?? event.action}</strong><p>{event.actorName}</p><time>{date(event.createdAt, true)}</time></div></li>)}</ol> : <Empty>Chưa có lịch sử hồ sơ.</Empty>}</ReadState>
          <button className="ep-bento-bottom-link" type="button" onClick={() => jumpToProfileSection('07')}>Tất cả dấu mốc<ArrowUpRight size={16} /></button>
        </article>
        <div className="ep-account-tile-wrap">
          <button className="ep-account-tile" type="button" disabled={photoBusy} onClick={() => onAction('account', person.id)}>
            <span><KeyRound size={21} /><strong>Tài khoản hệ thống</strong></span>
            <span>{account.loading ? 'Đang tải…' : account.error ? 'Chưa tải được thông tin' : account.data?.account?.username ?? 'Chưa cấp tài khoản'}<ArrowUpRight size={17} /></span>
          </button>
          {account.data?.account?.username && (
            <button
              type="button"
              className={`ep-tile-copy-btn${copiedField === 'username' ? ' is-copied' : ''}`}
              title="Sao chép tên đăng nhập hệ thống"
              aria-label="Sao chép tên đăng nhập hệ thống"
              aria-busy={copyBusy}
              aria-describedby={copyError ? copyErrorId : undefined}
              disabled={copyBusy || photoBusy}
              onClick={e => {
                e.stopPropagation();
                void copyText(account.data?.account?.username || '', 'username');
              }}
            >
              {copiedField === 'username' ? <Check size={13} className="ep-copy-check" /> : <Copy size={13} className="ep-copy-icon" />}
              <span aria-live="polite">{copyBusy ? 'Đang chép…' : copiedField === 'username' ? 'Đã sao chép' : 'Chép tài khoản'}</span>
            </button>
          )}
          {copyError && <p id={copyErrorId} className="ep-copy-feedback" role="alert">{copyError}</p>}
        </div>
      </aside>
      <WorkTimelineChart report={report} month={month} />
    </div>
    <ReadState value={report}>{data => <><p className="ep-source">{data.source === 'SNAPSHOT' ? `Bản chốt · phiên bản ${data.revision ?? '—'}` : 'Dữ liệu trực tiếp · chưa phải bản chốt cuối tháng'} · {data.period.status === 'LOCKED' ? 'Kỳ đã khóa' : 'Kỳ đang mở'}</p>{data.warnings?.map((warning, i) => <p className="ep-warning" key={i}>{warning}</p>)}</>}</ReadState>
  </section>;
}

export function EmployeeProfileOverlay({ initialEmployee, search, revision, branches, obscured, actionBusy, actionError, onClose, onAction: dispatchAction }: {
  initialEmployee: Person; search: string; revision: number; branches: { id: string; name: string }[];
  obscured: boolean; actionBusy: boolean; actionError: string; onClose: () => void; onAction: (action: EmployeeProfileAction, employeeId: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployee.id);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7));
  const [reload, setReload] = useState(0);
  const [closing, setClosing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [direction, setDirection] = useState<'initial' | 'next' | 'previous'>('initial');
  const [photoDraft, setPhotoDraft] = useState<PortraitDraft | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [photoRevision, setPhotoRevision] = useState(0);
  const photoBusyRef = useRef(false), photoConfirmRef = useRef(false), alive = useRef(true);
  const { request: requestPhotoDialog, dialog: photoDialog } = useActionDialog();
  const readRevision = revision + reload;
  const [rosterSearch, setRosterSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hoveredAvatar, setHoveredAvatar] = useState<Person | null>(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [headerCopied, setHeaderCopied] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId(), hintId = useId();
  const panel = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copyHeaderCode(code: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!code || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(code).then(() => {
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 1500);
    });
  }
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null), switchLock = useRef(false);
  useEmployeeProfileMotion(body);
  const roster = useProfileRead<Person[]>(`/employees${search ? `?search=${encodeURIComponent(search)}` : ''}`, readRevision);
  const profile = useProfileRead<Profile>(`/employees/${employeeId}`, readRevision);
  const account = useProfileRead<Account>(`/employees/${employeeId}/account`, readRevision);
  const report = useProfileRead<Report>(`/reporting/monthly/document?month=${month}&employeeId=${employeeId}`, readRevision);
  const balances = useProfileRead<Balance[]>(`/leave-requests/balances?year=${month.slice(0, 4)}`, readRevision);
  const leave = useProfileRead<RequestItem[]>('/leave-requests', readRevision);
  const overtime = useProfileRead<RequestItem[]>('/overtime-requests', readRevision);
  const explanations = useProfileRead<RequestItem[]>('/attendance/explanations', readRevision);
  const trips = useProfileRead<Trip[]>('/business-trips', readRevision);
  const discipline = useProfileRead<Discipline[]>('/disciplinary-actions', readRevision);
  const history = useProfileRead<Audit>(`/employees/${employeeId}/history`, readRevision + photoRevision);
  const photos = useProfileRead<PortraitMetadata[]>('/employees/portraits', readRevision + photoRevision);
  const grants = useProfileRead<ManagementGrant[]>('/organization/grants', readRevision);
  const explanationRoutes = useProfileRead<Route[]>('/attendance/explanations/routes', readRevision);
  const leaveRoutes = useProfileRead<Route[]>('/leave-requests/routes', readRevision);
  const overtimeRoutes = useProfileRead<Route[]>('/overtime-requests/routes', readRevision);
  const people = useMemo(() => roster.data ?? [], [roster.data]);
  const filteredPeople = useMemo(() => {
    if (!rosterSearch.trim()) return people;
    const q = rosterSearch.toLowerCase();
    return people.filter(p => p.fullName.toLowerCase().includes(q) || p.employeeCode.toLowerCase().includes(q));
  }, [people, rosterSearch]);
  const index = people.findIndex(person => person.id === employeeId);
  const selected = people[index] ?? (employeeId === initialEmployee.id ? initialEmployee : undefined);
  const photoByEmployee = useMemo(() => new Map(photos.data?.map(photo => [photo.employeeId, photo.version]) ?? []), [photos.data]);
  const photoVersion = photoByEmployee.get(employeeId);
  const discardPhoto = useCallback(async (): Promise<boolean> => {
    if (photoBusyRef.current || photoConfirmRef.current) return false;
    if (!photoDraft) return true;
    photoConfirmRef.current = true;
    try {
      const answer = await requestPhotoDialog({ title: 'Bỏ ảnh chưa lưu?', description: 'Ảnh đang xem trước chưa được lưu. Tiếp tục sẽ bỏ ảnh vừa chọn, không thay đổi ảnh hồ sơ hiện tại.', confirmLabel: 'Bỏ ảnh chưa lưu' });
      if (answer === null) return false;
      setPhotoDraft(null); return true;
    } finally { photoConfirmRef.current = false; }
  }, [photoDraft, requestPhotoDialog]);
  const close = useCallback(async () => {
    if (obscured || actionBusy || closing || closeTimer.current || !(await discardPhoto())) return;
    if (closeTimer.current) return;
    if (switchTimer.current) clearTimeout(switchTimer.current);
    setClosing(true);
    closeTimer.current = setTimeout(onClose, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  }, [obscured, actionBusy, closing, onClose, discardPhoto]);
  const switchPerson = useCallback(async (id: string) => {
    if (obscured || actionBusy || closing || closeTimer.current || switchLock.current || id === employeeId) return;
    switchLock.current = true;
    if (!(await discardPhoto()) || closeTimer.current || !alive.current) { switchLock.current = false; return; }
    const nextDirection = people.findIndex(person => person.id === id) < index ? 'previous' : 'next';
    setDirection(nextDirection);
    const commit = () => {
      switchTimer.current = null;
      switchLock.current = false;
      setPhotoError(''); setPhotoMessage(''); setEmployeeId(id); setSwitching(false);
      if (body.current) body.current.scrollTop = 0;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { commit(); return; }
    if (document.activeElement?.closest('.ep-body')) panel.current?.querySelector<HTMLButtonElement>(`[aria-label="${nextDirection === 'next' ? 'Nhân viên tiếp theo' : 'Nhân viên trước'}"]`)?.focus({ preventScroll: true });
    setSwitching(true);
    switchTimer.current = setTimeout(commit, 200);
  }, [obscured, actionBusy, closing, employeeId, discardPhoto, people, index]);
  async function performAction(action: EmployeeProfileAction, id: string): Promise<void> {
    if (!obscured && !actionBusy && !switchLock.current && await discardPhoto()) dispatchAction(action, id);
  }
  function onAction(action: EmployeeProfileAction, id: string): void { void performAction(action, id); }
  async function choosePhoto(file: File): Promise<void> {
    if (photoBusyRef.current || switchLock.current || photos.loading || photos.error) return;
    photoBusyRef.current = true; setPhotoBusy(true); setPhotoError(''); setPhotoMessage('');
    try {
      const prepared = await prepareEmployeePortrait(file);
      if (alive.current) setPhotoDraft(prepared); else URL.revokeObjectURL(prepared.preview);
    } catch (error) { if (alive.current) setPhotoError(error instanceof Error ? error.message : 'Không đọc được ảnh.'); }
    finally { photoBusyRef.current = false; if (alive.current) setPhotoBusy(false); }
  }
  async function savePhoto(): Promise<void> {
    if (!photoDraft || photoBusyRef.current || switchLock.current || photos.loading || photos.error) return;
    photoBusyRef.current = true; setPhotoBusy(true); setPhotoError(''); setPhotoMessage('');
    try {
      await saveEmployeePortrait(employeeId, photoVersion, photoDraft);
      setPhotoDraft(null); setPhotoRevision(value => value + 1); setPhotoMessage('Đã lưu ảnh chân dung vào hồ sơ nhân viên.');
    } catch (error) { setPhotoError(error instanceof Error ? error.message : 'Không lưu được ảnh. Kiểm tra trạng thái trước khi gửi lại.'); }
    finally { photoBusyRef.current = false; setPhotoBusy(false); }
  }
  async function removePhoto(): Promise<void> {
    if (photoBusyRef.current || switchLock.current || !photoVersion || photoConfirmRef.current) return;
    photoConfirmRef.current = true;
    const answer = await requestPhotoDialog({ title: 'Gỡ ảnh chân dung?', description: 'Chỉ gỡ ảnh đang gắn với hồ sơ này. Không xóa thông tin hoặc tài khoản nhân viên. Không có nút khôi phục ảnh; bạn có thể tải lại từ ảnh gốc.', confirmLabel: 'Gỡ ảnh', danger: true });
    photoConfirmRef.current = false;
    if (answer === null) return;
    photoBusyRef.current = true; setPhotoBusy(true); setPhotoError(''); setPhotoMessage('');
    try {
      await apiRequest(`/employees/${employeeId}/portrait`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: photoVersion }) });
      setPhotoRevision(value => value + 1); setPhotoMessage('Đã gỡ ảnh chân dung. Hồ sơ nhân viên vẫn được giữ nguyên.');
    } catch (error) { setPhotoError(error instanceof Error ? error.message : 'Không gỡ được ảnh.'); }
    finally { photoBusyRef.current = false; setPhotoBusy(false); }
  }
  useEffect(() => () => { if (photoDraft) URL.revokeObjectURL(photoDraft.preview); }, [photoDraft]);
  useEffect(() => {
    if (!photoDraft && !photoBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [photoDraft, photoBusy]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const shell = document.querySelector<HTMLElement>('.admin-shell');
    const wasInert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (switchTimer.current) clearTimeout(switchTimer.current);
      document.body.style.overflow = overflow;
      if (shell) shell.inert = wasInert;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const updateActive = () => {
      const scrollY = el.scrollTop + 140;
      let current = 'overview';
      const sectionIds = ['01', '02', '03', '04', '05', '06', '07'];
      for (const id of sectionIds) {
        const target = document.getElementById(`ep-section-${id}`);
        if (target && scrollY >= target.offsetTop) {
          current = id;
        }
      }
      setActiveSection(current);
    };
    el.addEventListener('scroll', updateActive, { passive: true });
    return () => el.removeEventListener('scroll', updateActive);
  }, [employeeId, profile.loading]);

  useEffect(() => {
    const active = strip.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const container = strip.current;
    if (!active || !container) return;
    const center = () => container.scrollTo({ left: active.offsetLeft - (container.clientWidth - active.clientWidth) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    center();
    const observer = new ResizeObserver(center);
    observer.observe(container);
    return () => observer.disconnect();
  }, [employeeId, roster.data]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (obscured || document.querySelector('.workflow-overlay, .dialog-backdrop')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (searchOpen) {
          setSearchOpen(false);
          setRosterSearch('');
        } else {
          close();
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !target?.closest('input,textarea,select,[contenteditable="true"]')) {
        const next = event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowRight' ? index + 1 : -1;
        if (index >= 0 && people[next]) {
          event.preventDefault();
          switchPerson(people[next].id);
          return;
        }
        if (event.key === '0' || event.key.toLowerCase() === 'o') {
          event.preventDefault();
          body.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          return;
        }
        if (['1', '2', '3', '4', '5', '6', '7'].includes(event.key)) {
          event.preventDefault();
          jumpToProfileSection(`0${event.key}`);
          return;
        }
        if (event.key.toLowerCase() === 'f' || event.key === '/') {
          event.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
          return;
        }
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]') ?? [])].filter(node => node.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [close, obscured, index, people, switchPerson, searchOpen]);

  return <>{photoDialog && createPortal(photoDialog, document.body)}{createPortal(<div className={`ep-backdrop${closing ? ' is-closing' : ''}`} onClick={event => { if (event.target === event.currentTarget) void close(); }}>
    <div ref={panel} className="ep-dialog" data-ep-direction={direction} data-ep-switching={switching || undefined} role="dialog" aria-modal={!obscured && !photoDialog} aria-labelledby={titleId} aria-describedby={hintId} aria-hidden={obscured || Boolean(photoDialog) || undefined} inert={obscured || Boolean(photoDialog)} tabIndex={-1}>
      <div className="ep-ambient-canvas" aria-hidden="true">
        <div className="ep-aurora ep-aurora-purple" />
        <div className="ep-aurora ep-aurora-teal" />
        <div className="ep-aurora ep-aurora-amber" />
      </div>
      <header className="ep-header">
        <div className="ep-header-person">
          <span className="ep-header-mark" aria-hidden="true"><UserRound size={18} /></span>
          <div>
            <span className="ep-kicker">HỒ SƠ NHÂN SỰ</span>
            <h2 id={titleId}>{selected?.fullName ?? 'Hồ sơ nhân viên'}</h2>
            <div className="ep-header-code-row">
              {selected?.employeeCode ? (
                <button
                  type="button"
                  className={`ep-code-badge${headerCopied ? ' is-copied' : ''}`}
                  title="Sao chép mã nhân viên (1 chạm)"
                  aria-label={`Sao chép mã ${selected.employeeCode}`}
                  onClick={(e) => copyHeaderCode(selected.employeeCode, e)}
                >
                  {headerCopied ? <Check size={11} className="ep-copy-check" /> : <Copy size={11} className="ep-copy-icon" />}
                  <span>{headerCopied ? 'Đã sao chép' : selected.employeeCode}</span>
                </button>
              ) : (
                <p>{selected?.employeeCode ?? 'Đang tải'}</p>
              )}
            </div>
          </div>
        </div>
        <div className="ep-header-tools">
          <div className="ep-paging">
            <button className="ep-icon" type="button" aria-label="Nhân viên trước (Phím ←)" disabled={index <= 0 || closing || actionBusy || photoBusy} onClick={() => void switchPerson(people[index - 1].id)}>
              <ArrowLeft size={18} />
            </button>
            <span aria-live="polite" aria-atomic="true">{index >= 0 ? `${index + 1} / ${people.length}` : '—'}</span>
            <button className="ep-icon" type="button" aria-label="Nhân viên tiếp theo (Phím →)" disabled={index < 0 || index >= people.length - 1 || closing || actionBusy || photoBusy} onClick={() => void switchPerson(people[index + 1].id)}>
              <ArrowRight size={18} />
            </button>
          </div>
          <button type="button" aria-label="Tải lại hồ sơ" title="Tải lại hồ sơ" onClick={() => void discardPhoto().then(discarded => { if (discarded) { setPhotoError(''); setPhotoMessage(''); setReload(value => value + 1); } })} disabled={profile.loading || photoBusy || actionBusy} className="ep-icon ep-reload">
            <RefreshCw size={17} />
          </button>
          <button className="ep-icon ep-close" type="button" aria-label="Đóng hồ sơ nhân viên (Phím Esc)" disabled={actionBusy || photoBusy} onClick={() => void close()}>
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="ep-roster-wrap" data-search-open={searchOpen || undefined}>
        <div className="ep-roster-top-bar">
          {searchOpen ? (
            <div className="ep-roster-search-field">
              <Search size={13} className="ep-search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Tìm tên hoặc mã nhân sự"
                placeholder="Tìm tên hoặc mã nhân sự…"
                value={rosterSearch}
                onChange={e => setRosterSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setSearchOpen(false);
                    setRosterSearch('');
                  }
                }}
              />
              {rosterSearch && (
                <button type="button" className="ep-clear-search-btn" onClick={() => setRosterSearch('')} aria-label="Xóa từ khóa"><X size={12} /></button>
              )}
              <button type="button" className="ep-close-search-btn" onClick={() => { setSearchOpen(false); setRosterSearch(''); }} aria-label="Đóng tìm kiếm"><X size={13} /></button>
            </div>
          ) : (
            <button
              type="button"
              className="ep-open-search-pill"
              aria-label={`Tìm nhanh trong ${people.length} nhân sự`}
              title="Tìm nhanh nhân sự trong danh sách (Phím F hoặc /)"
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 60);
              }}
            >
              <Search size={12} />
              <span>Tìm nhân sự ({people.length})</span>
            </button>
          )}
        </div>
        <div ref={strip} className="ep-roster" aria-label="Chuyển nhanh nhân viên">
          {filteredPeople.map(person => (
            <button
              key={person.id}
              type="button"
              disabled={photoBusy || actionBusy || closing}
              aria-label={`Xem hồ sơ ${person.fullName} (${person.employeeCode})`}
              aria-current={person.id === employeeId ? 'true' : undefined}
              className={`ep-roster-btn${person.id === employeeId ? ' is-active' : ''}`}
              title={`${person.fullName} · ${person.employeeCode}`}
              onMouseEnter={() => setHoveredAvatar(person)}
              onMouseLeave={() => setHoveredAvatar(curr => curr?.id === person.id ? null : curr)}
              onClick={() => void switchPerson(person.id)}
            >
              <PortraitImage employeeId={person.id} version={photoByEmployee.get(person.id)} name={person.fullName} thumbnail />
              <span className={`ep-roster-status-dot ${person.isActive ? 'is-active' : 'is-inactive'}`} />
              <small>{person.fullName}</small>
            </button>
          ))}
        </div>
        {hoveredAvatar && (
          <div className="ep-roster-preview-pill" role="tooltip">
            <div className="ep-preview-name-row">
              <strong>{hoveredAvatar.fullName}</strong>
              <span>{hoveredAvatar.employeeCode}</span>
            </div>
            <small className={hoveredAvatar.isActive ? 'ep-tag-active' : 'ep-tag-inactive'}>
              {hoveredAvatar.isActive ? '● Đang hoạt động' : '○ Tạm khóa'}
            </small>
          </div>
        )}
        <p id={hintId}>
          {roster.loading ? 'Đang tải danh sách…' : roster.error ? `Chưa tải: ${roster.error}` : rosterSearch ? `Tìm thấy ${filteredPeople.length} / ${people.length} nhân sự` : search ? `Kết quả “${search}”` : `${people.length} nhân sự`}
          <span className="ep-keyboard-hint"> · ← → đổi người · 0-7 nhảy mục · Esc đóng</span>
        </p>
      </div>
      <nav className="ep-profile-rail" aria-label="Các phần trong hồ sơ">
        <span className="ep-rail-brand" aria-hidden="true">tm<span>.</span></span>
        {[
          { id: 'overview', title: 'Tổng quan hồ sơ', shortcut: '0', icon: <UserRound size={20} /> },
          { id: '01', title: '01 · Đơn vị công tác', shortcut: '1', icon: <Network size={20} /> },
          { id: '02', title: '02 · Công & quỹ phép', shortcut: '2', icon: <CalendarDays size={20} /> },
          { id: '03', title: '03 · Đơn từ & phê duyệt', shortcut: '3', icon: <FileText size={20} /> },
          { id: '06', title: '06 · Quyền & tài khoản', shortcut: '6', icon: <ShieldCheck size={20} /> },
          { id: '07', title: '07 · Dấu mốc lịch sử', shortcut: '7', icon: <History size={20} /> },
        ].map(item => (
          <div key={item.id} className="ep-rail-item">
            <button
              type="button"
              className={activeSection === item.id ? 'is-active' : ''}
              title={`${item.title} (Phím ${item.shortcut})`}
              aria-label={`${item.title} (Phím ${item.shortcut})`}
              aria-current={activeSection === item.id ? 'true' : undefined}
              onClick={() => {
                if (item.id === 'overview') {
                  body.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
                } else {
                  jumpToProfileSection(item.id);
                }
              }}
            >
              {item.icon}
              <span className="ep-rail-indicator" />
            </button>
            <span className="ep-rail-tooltip">{item.title}<kbd>{item.shortcut}</kbd></span>
          </div>
        ))}
      </nav>
      <div className="ep-keyboard-hud" aria-hidden="true">
        <span className="ep-hud-tag"><kbd>←</kbd><kbd>→</kbd> Đổi người</span>
        <span className="ep-hud-tag"><kbd>0-7</kbd> Mục</span>
        <span className="ep-hud-tag"><kbd>F</kbd> Tìm</span>
        <span className="ep-hud-tag"><kbd>Esc</kbd> Đóng</span>
      </div>
      <span className="ep-visually-hidden" role="status">{switching ? 'Đang chuyển hồ sơ nhân viên…' : ''}</span>
      <div ref={body} className="ep-body" tabIndex={0} aria-label="Nội dung hồ sơ cuộn" aria-busy={switching || profile.loading}>
        <div className="ep-content" key={employeeId} inert={switching || closing} aria-hidden={switching || closing || undefined}>
          {actionError && <p className="ep-error" role="alert">{actionError}</p>}
          {actionBusy && <p className="ep-warning" role="status">Đang chuẩn bị thao tác… Vui lòng đợi trước khi chuyển hồ sơ.</p>}
          {(photoError || photos.error) && <p className="ep-error" role="alert">{photoError || `Ảnh hồ sơ chưa sẵn sàng: ${photos.error}`}</p>}
          {photoMessage && <p className="ep-success" role="status"><Check size={20} className="ep-success-check" aria-hidden="true" /><span>{photoMessage}</span></p>}
          <ReadState value={profile}>{person => <>
            <ProfileBento person={person} employeeId={employeeId} month={month} setMonth={setMonth} report={report} leave={leave} overtime={overtime} explanations={explanations} history={history} account={account} photoVersion={photoVersion} photoDraft={photoDraft} photoBusy={photoBusy || photos.loading || Boolean(photos.error) || actionBusy} onChoosePhoto={file => void choosePhoto(file)} onSavePhoto={() => void savePhoto()} onCancelPhoto={() => { setPhotoDraft(null); setPhotoError(''); }} onRemovePhoto={() => void removePhoto()} onAction={onAction} />
            <div className="ep-scroll-cue"><ChevronDown size={16} />Chi tiết hồ sơ bên dưới</div>
            <Section number="01" icon={<Network size={20} />} title="Thông tin & đơn vị công tác" note="Phân công hiện tại; không suy diễn thành viên team từ phòng ban.">
              <div className="ep-two-col"><dl className="ep-facts ep-card"><div><dt>Mã nhân viên</dt><dd>{person.employeeCode}</dd></div><div><dt>Số điện thoại</dt><dd>{person.phone || 'Chưa cập nhật'}</dd></div><div><dt>Ngày vào làm</dt><dd>{date(person.hireDate)}</dd></div><div><dt>Loại nhân sự</dt><dd>{types[person.employeeType] ?? person.employeeType}</dd></div>{!person.isActive && <><div><dt>Ngày ngừng làm việc</dt><dd>{date(person.employmentEndDate)}</dd></div><div><dt>Lý do</dt><dd>{person.employmentStatusReason || 'Chưa ghi nhận'}</dd></div></>}</dl>
                <div className="ep-card"><h4>Phân công tổ chức</h4>{person.organizationAssignments.length ? person.organizationAssignments.map(a => <article className="ep-record" key={a.id}><div className="ep-record-heading"><strong>{a.departmentName}</strong>{a.isPrimary && <span className="ep-chip">Chính</span>}</div><p>{a.branchName}</p><p className="ep-muted">{a.positionName || 'Chưa phân chức vụ'} · Quản lý: {a.managerName || 'Chưa phân công'}</p></article>) : <Empty>Chưa có phân công tổ chức.</Empty>}</div></div>
            </Section>
            <Section number="02" icon={<CalendarDays size={20} />} title="Chấm công & quỹ phép" note="Quỹ phép là số liệu năm tại thời điểm tải, không phải số dư chốt cuối tháng.">
              <ReadState value={balances}>{data => { const rows = data.filter(row => row.employeeId === employeeId); return rows.length ? <div className="ep-two-col">{rows.map(row => <article className="ep-card" key={row.policyId}><div className="ep-record-heading"><h4>{row.policyName} · {month.slice(0, 4)}</h4><span className="ep-chip">{row.initialized ? 'Đã khởi tạo' : 'Quỹ dự kiến'}</span></div><strong className="ep-balance">{duration(row.availableMinutes)}<small>Còn khả dụng</small></strong><p className="ep-muted">Chuẩn một ngày: {duration(row.dayMinutes)}. Tương đương {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(row.availableMinutes / row.dayMinutes)} ngày.</p><dl className="ep-facts"><div><dt>Quỹ gốc / cộng dồn</dt><dd>{duration(row.entitlementMinutes)} / {duration(row.carryOverMinutes)}</dd></div><div><dt>Đã dùng / đang giữ</dt><dd>{duration(row.approvedMinutes)} / {duration(row.pendingMinutes)}</dd></div><div><dt>Điều chỉnh</dt><dd>{duration(row.adjustmentMinutes)}</dd></div></dl></article>)}</div> : <Empty>Chưa có quỹ phép theo dõi cho nhân viên trong năm này. Không đồng nghĩa số dư bằng 0.</Empty>; }}</ReadState>
              <details className="ep-details"><summary>Chi tiết từng ngày · {month}</summary><ReadState value={report}>{data => data.rows.length ? <div className="ep-table-scroll" tabIndex={0} aria-label="Bảng công cuộn ngang"><table>
                <caption>Bảng công nhân viên · {month} · múi giờ Việt Nam</caption><thead><tr><th>Ngày</th><th>Hình thức</th><th>Vào / Ra</th><th>Thời gian / OT</th><th>Trạng thái</th><th>Đối soát</th></tr></thead>
                <tbody>{data.rows.map(row => <tr key={row.workDate}>
                  <td>{date(row.workDate)}</td><td>{row.attendanceType === 'BUSINESS_TRIP' ? 'Hiện trường' : row.attendanceType === 'OFFICE' ? 'Văn phòng' : row.attendanceType ?? '—'}</td>
                  <td>{clock(row.checkedInAt)} / {clock(row.checkedOutAt)}</td><td>{duration(row.workedMinutes)} / {duration(row.overtimeMinutes)}</td>
                  <td><StatusBadge value={row.status} />{row.isFullWorkday && <small>Đủ công</small>}</td><td>{row.riskFlags.length ? row.riskFlags.join(', ') : '—'}{row.adjustmentCount > 0 && <small>{row.adjustmentCount} điều chỉnh</small>}</td>
                </tr>)}</tbody></table></div> : <Empty>Chưa có dòng báo cáo trong tháng này.</Empty>}</ReadState></details>
            </Section>
            <Section number="03" icon={<FileText size={20} />} title="Đơn từ & xử lý" note="Toàn bộ đơn của nhân viên, không giới hạn theo tháng báo cáo. Phê duyệt và tính công vẫn theo Backend."><div className="ep-two-col"><Requests title="Đơn nghỉ phép" value={leave} employeeId={employeeId} /><Requests title="Phiếu OT" value={overtime} employeeId={employeeId} /><Requests title="Giải trình" value={explanations} employeeId={employeeId} /></div></Section>
            <Section number="04" icon={<BriefcaseBusiness size={20} />} title="Công tác & phân công" note="Trạng thái tham gia phiếu không được cộng thêm thành công chấm hằng ngày."><ReadState value={trips}>{data => { const rows = data.filter(row => row.members.some(member => member.employeeId === employeeId)); return rows.length ? <div className="ep-two-col">{rows.map(row => { const member = row.members.find(item => item.employeeId === employeeId)!; return <article className="ep-card" key={row.id}><div className="ep-record-heading"><strong>{row.code}</strong><StatusBadge value={row.status} /></div><h4>{row.siteName}</h4><p>{row.customerName || 'Chưa có khách hàng'} · {date(row.startAt)} – {date(row.endAt)}</p><p>{row.content}</p><p className="ep-muted">Tham gia: <StatusBadge value={member.status} /></p><p className="ep-muted">Bắt đầu: {date(member.startedAt, true)} · Kết thúc: {date(member.completedAt, true)}</p></article>; })}</div> : <Empty>Chưa có phiếu công tác phân cho nhân viên.</Empty>; }}</ReadState></Section>
            <Section number="05" icon={<ShieldAlert size={20} />} title="Kỷ luật & quyết định" note="Giữ cả quyết định đã thu hồi và lý do; không tự gán đánh giá nhân viên."><ReadState value={discipline}>{data => { const rows = data.filter(row => row.employeeId === employeeId); return rows.length ? <div className="ep-two-col">{rows.map(row => <article className="ep-card" key={row.id}><div className="ep-record-heading"><h4>{row.title}</h4><StatusBadge value={row.status} /></div><p>{row.reason}</p><p>{row.decision}</p><p className="ep-muted">Hiệu lực: {date(row.effectiveFrom)} – {row.effectiveTo ? date(row.effectiveTo) : 'Không thời hạn'} · Ban hành: {row.issuedByName || 'Chưa ban hành'}</p>{row.revocationReason && <p className="ep-warning">Thu hồi: {row.revocationReason}</p>}</article>)}</div> : <Empty>Chưa có quyết định kỷ luật được ghi nhận.</Empty>; }}</ReadState></Section>
            <Section number="06" icon={<ShieldCheck size={20} />} title="Tài khoản & quyền quản lý" note="Chỉ Admin xem hồ sơ này. Không lưu hoặc hiển thị mật khẩu gốc."><div className="ep-two-col"><div className="ep-card"><h4>Tài khoản hệ thống</h4><ReadState value={account}>{data => data.account ? <dl className="ep-facts"><div><dt>Tên đăng nhập</dt><dd>{data.account.username}</dd></div><div><dt>Tài khoản</dt><dd><StatusBadge value={data.account.isActive ? 'ACTIVE' : 'INACTIVE'} /></dd></div><div><dt>Vai trò hệ thống</dt><dd>{person.accountRoles.map(role => roles[role] ?? role).join(', ') || 'Chưa có'}</dd></div><div><dt>Phạm vi chi nhánh được gán</dt><dd>{person.scopeBranchIds.map(id => branches.find(branch => branch.id === id)?.name ?? 'Chi nhánh không còn trong danh mục').join(', ') || 'Không có phạm vi riêng'}</dd></div></dl> : <Empty>Chưa cấp tài khoản đăng nhập.</Empty>}</ReadState></div>
              <div className="ep-card"><h4>Quyền quản lý được cấp</h4><ReadState value={grants}>{data => { const rows = data.filter(row => row.employeeCode === person.employeeCode); return rows.length ? rows.map(row => <article className="ep-record" key={row.id}><div className="ep-record-heading"><strong>{roles[row.roleCode] ?? row.roleCode}</strong><span className="ep-chip">{grantStates[row.status] ?? row.status}</span></div><p>{row.departmentName}{row.teamName ? ` · ${row.teamName}` : ''}</p><p className="ep-muted">{row.appointmentType === 'TEMPORARY' ? 'Tạm thời' : 'Chính thức'} · {date(row.validFrom)} – {row.validUntil ? date(row.validUntil) : 'Vô thời hạn'}</p>{row.revocationReason && <p className="ep-muted">Thu hồi: {row.revocationReason}</p>}</article>) : <Empty>Chưa có quyền quản lý được cấp.</Empty>; }}</ReadState></div></div>
              <div className="ep-routes">{[{ name: 'Giải trình', resource: explanationRoutes }, { name: 'Nghỉ phép', resource: leaveRoutes }, { name: 'OT', resource: overtimeRoutes }].map(route => <div className="ep-card" key={route.name}><h4>Tuyến {route.name}</h4><ReadState value={route.resource}>{data => { const value = data.find(row => row.employeeId === employeeId); return value ? <><p>{value.teamName}</p><ol><li>Leader: <strong>{value.leaderName}</strong></li><li>Trưởng phòng: <strong>{value.headName}</strong></li></ol><small className="ep-muted">Cấu hình riêng · phiên bản {value.version}</small></> : <Empty>Chưa cấu hình tuyến riêng.</Empty>; }}</ReadState></div>)}</div>
            </Section>
            <Section number="07" icon={<History size={20} />} title="Lịch sử hồ sơ" note="Hiển thị người và thời điểm thao tác; không đưa dữ liệu kỹ thuật nhạy cảm lên phần tổng quan."><ReadState value={history}>{data => data.events.length ? <ol className="ep-timeline">{data.events.map(event => <li key={event.id}><span aria-hidden="true" /><div><strong>{actions[event.action] ?? event.action}</strong><p>{event.actorName} · {date(event.createdAt, true)}</p></div></li>)}</ol> : <Empty>Chưa có lịch sử hồ sơ.</Empty>}</ReadState><button className="ep-secondary" type="button" onClick={() => onAction('history', person.id)}><History size={16} />Xem lịch sử phân công chi tiết</button></Section>
            <footer className="ep-footer"><div><strong>Thao tác quản trị</strong><p>Thay đổi trạng thái và xóa luôn có bước kiểm tra riêng.</p></div><div><button className="ep-secondary" type="button" onClick={() => onAction('status', person.id)}>{person.isActive ? 'Ngừng làm việc' : 'Khôi phục hoạt động'}</button><button className="ep-danger" type="button" onClick={() => onAction('delete', person.id)}><Trash2 size={16} />Xóa nhân viên</button></div></footer>
          </>}</ReadState>
        </div>
      </div>
    </div>
  </div>, document.body)}</>;
}
