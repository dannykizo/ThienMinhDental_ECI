'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  CircleCheckBig,
  ClipboardPenLine,
  Clock3,
  Megaphone,
  FileSpreadsheet,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadingState, Notice, formatDate } from '@/components/admin-ui';
import { apiRequest, getAdminSession } from '@/lib/auth-api';
import { DashboardAttendancePanels } from '@/components/dashboard-attendance';
import './dashboard.css';

interface DashboardSummary {
  activeEmployees: number;
  attendanceToday: number;
  reviewRequired: number;
  activeTrips: number;
  pendingLeave: number;
  publishedAnnouncements: number;
  incompleteToday: number;
  openExplanations: number;
  pendingOvertime: number;
  workDate: string;
  asOf: string;
  scopeLabel: string;
  attendanceSource: 'LIVE' | 'SNAPSHOT';
  attendanceRevision: number | null;
  warnings: string[];
}

const metrics: Array<{
  key: keyof DashboardSummary;
  label: string;
  note: string;
  icon: LucideIcon;
  href: string;
}> = [
  {
    key: 'activeEmployees',
    label: 'Nhân viên hoạt động',
    note: 'Hồ sơ đang sử dụng',
    icon: UsersRound,
    href: '/dashboard/employees',
  },
  {
    key: 'attendanceToday',
    label: 'Đã ghi nhận hôm nay',
    note: 'Ngày có giờ vào/ra hiệu lực trong báo cáo; chưa đồng nghĩa đủ công',
    icon: Clock3,
    href: '/dashboard/attendance',
  },
  {
    key: 'reviewRequired',
    label: 'Ngày có cảnh báo / điều chỉnh',
    note: 'Đếm mỗi nhân viên/ngày một lần, cùng nguồn báo cáo',
    icon: TriangleAlert,
    href: '/dashboard/attendance',
  },
  {
    key: 'activeTrips',
    label: 'Công tác đang mở',
    note: 'Phiếu đã giao/đang thực hiện; không phải số ngày công',
    icon: CarFront,
    href: '/dashboard/business-trips',
  },
  {
    key: 'pendingLeave',
    label: 'Đơn nghỉ chờ duyệt',
    note: 'Cần quản lý xem xét và phê duyệt',
    icon: ClipboardPenLine,
    href: '/dashboard/leave-workflow',
  },
  {
    key: 'publishedAnnouncements',
    label: 'Thông báo nội bộ',
    note: 'Nội dung đang phát hành',
    icon: Megaphone,
    href: '/dashboard/announcements',
  },
];

function AnimatedNumber({ value }: { value: number | string }) {
  if (typeof value !== 'number') {
    return <span className="tabular-nums">{value}</span>;
  }
  return <NumericCounter target={value} />;
}

function NumericCounter({ target }: { target: number }) {
  const [current, setCurrent] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return target;
    }
    return 0;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let startTime: number | null = null;
    const duration = 500;
    let frameId: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCurrent(Math.round(easedProgress * target));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setCurrent(target);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target]);

  return <span className="tabular-nums">{current}</span>;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [navigation, setNavigation] = useState<string[]>([]);
  const [canReadReport, setCanReadReport] = useState(false);
  const requestNumber = useRef(0);
  const load = useCallback(async (): Promise<void> => {
    const request = ++requestNumber.current;
    try {
      const [data, user] = await Promise.all([apiRequest<DashboardSummary>('/reporting/dashboard'), getAdminSession()]);
      if (request !== requestNumber.current) return;
      setSummary(data); setNavigation(user.portal?.navigation ?? []);
      setCanReadReport(user.roles.some(role => role === 'ADMIN' || role === 'CHIEF_ACCOUNTANT') && !!user.portal?.navigation.includes('/dashboard/reports'));
    } catch (caught) {
      if (request === requestNumber.current) setError(caught instanceof Error ? caught.message : 'Không thể tải số liệu tổng quan.');
    } finally { if (request === requestNumber.current) setLoading(false); }
  }, []);
  function reload(): void {
    setLoading(true); setSummary(null); setError(''); setNavigation([]); setCanReadReport(false);
    void load();
  }
  const priorityItems = summary ? [
    { count: summary.reviewRequired, href: '/dashboard/attendance', label: 'Cảnh báo / điều chỉnh', note: 'Ngày nhân sự hôm nay', icon: TriangleAlert, tone: 'amber' },
    { count: summary.incompleteToday, href: '/dashboard/attendance', label: 'Chưa có check-out', note: 'Hôm nay · có thể đang làm việc', icon: Clock3, tone: 'blue' },
    { count: summary.openExplanations, href: '/dashboard/explanations', label: 'Giải trình chưa hoàn tất', note: 'Đơn đang mở · mọi ngày', icon: ClipboardPenLine, tone: 'purple' },
    { count: summary.pendingLeave, href: '/dashboard/leave-workflow', label: 'Nghỉ phép chờ xử lý', note: 'Đơn đang chờ · mọi ngày', icon: CalendarDays, tone: 'mint' },
    { count: summary.pendingOvertime, href: '/dashboard/overtime', label: 'Tăng ca chờ xử lý', note: 'Phiếu OT đang chờ · mọi ngày', icon: Clock3, tone: 'purple' },
    { count: summary.activeTrips, href: '/dashboard/business-trips', label: 'Công tác đang mở', note: 'Phiếu đã giao / đang thực hiện', icon: CarFront, tone: 'blue' },
  ].filter((item) => item.count > 0) : [];

  useEffect(() => {
    const sequence = requestNumber;
    let active = true;
    // Initial loading flags are already set; start the fetch in an async callback.
    void Promise.resolve().then(() => { if (active) void load(); });
    const focus = () => { setLoading(true); setSummary(null); setError(''); setNavigation([]); setCanReadReport(false); void load(); };
    window.addEventListener('focus', focus);
    return () => { active = false; ++sequence.current; window.removeEventListener('focus', focus); };
  }, [load]);

  return (
    <div className="dashboard-page dashboard-preview module-page">
      {error && <Notice kind="error">{error}</Notice>}

      {loading ? (
        <LoadingState />
      ) : !summary ? null : (
        <>
          {/* Executive Command Center Banner */}
          <section className="db-hero-banner" aria-label="Trung tâm điều hành doanh nghiệp">
            <div className="db-hero-left">
              <div className="db-hero-kicker-row">
                <span className="db-hero-badge">
                  <Sparkles size={13} aria-hidden="true" />
                  Thiên Minh Dental OS
                </span>
                <span className="cfg-current-badge" style={{ marginTop: 0 }}>
                  <span className="cfg-pulse-dot" />
                  Vận hành ổn định
                </span>
              </div>
              <h1 className="db-hero-title">Trung tâm Điều hành & Chấm công Doanh nghiệp</h1>
              <div className="db-hero-meta">
                <span className="db-hero-meta-chip">
                  <CalendarDays size={14} aria-hidden="true" />
                  Ngày công {summary.workDate} · GMT+7
                </span>
                <span className="db-hero-meta-chip">
                  <MapPin size={14} aria-hidden="true" />
                  {summary.scopeLabel}
                </span>
                <span className="db-hero-meta-chip is-source">
                  <ShieldCheck size={14} aria-hidden="true" />
                  {summary.attendanceSource === 'SNAPSHOT'
                    ? `Bản chốt v${summary.attendanceRevision}`
                    : 'Dữ liệu thời gian thực'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 4 }}>
                  Cập nhật: {formatDate(summary.asOf)}
                </span>
              </div>
            </div>

            <div className="db-hero-actions">
              {navigation.includes('/dashboard/reports') && (
                <Link className="db-btn-excel btn-tactile" href="/dashboard/reports">
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  Báo cáo & Xuất Excel
                </Link>
              )}
              <button
                className="db-btn-refresh btn-tactile"
                title="Làm mới số liệu thời gian thực"
                aria-label="Làm mới số liệu thời gian thực"
                type="button"
                disabled={loading}
                onClick={reload}
              >
                <RefreshCw size={18} className={loading ? 'is-loading' : ''} />
              </button>
            </div>
          </section>

          {summary.warnings.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}

          {/* 4 Hero KPI Cards */}
          <section aria-label="Chỉ số tổng quan" className="metric-grid">
            {metrics.slice(0, 4).map((metric, index) => {
              const val = summary[metric.key];
              const tagLabels = ['Hồ sơ', 'Hôm nay', 'Đối soát', 'Đang mở'];
              const subBadges = [
                '● Đang hoạt động',
                '● Ghi nhận vào/ra',
                '● Cần đối soát',
                '● Đang thực hiện',
              ];
              const content = (
                <>
                  <div className="metric-card-top">
                    <span className={`db-metric-icon tone-${index}`}>
                      <metric.icon
                        aria-hidden="true"
                        className="metric-card-icon"
                        size={20}
                        strokeWidth={2}
                      />
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cfg-card-chip" style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
                        {tagLabels[index]}
                      </span>
                      <ArrowUpRight size={16} aria-hidden="true" className="db-metric-arrow" />
                    </div>
                  </div>
                  <div className="db-metric-value">
                    <strong>{typeof val === 'number' ? <AnimatedNumber value={val} /> : '—'}</strong>
                    <p>{metric.label}</p>
                  </div>
                  <div className="db-metric-footer">
                    <span className={`db-metric-sub tone-${index}`}>{subBadges[index]}</span>
                    <span className="db-metric-note">{metric.note}</span>
                  </div>
                </>
              );
              return navigation.includes(metric.href) ? (
                <Link
                  className={`metric-card card-interactive tone-card-${index}`}
                  href={metric.href}
                  key={metric.key}
                  style={{ textDecoration: 'none' }}
                >
                  {content}
                </Link>
              ) : (
                <div className={`metric-card tone-card-${index}`} key={metric.key}>
                  {content}
                </div>
              );
            })}
          </section>

          <div className={`db-workspace${canReadReport ? '' : ' db-workspace-summary'}`}>
            <DashboardAttendancePanels
              key={summary.asOf}
              workDate={summary.workDate}
              refreshKey={summary.asOf}
              enabled={canReadReport}
            >
              <section className="db-panel db-priority" aria-labelledby="priority-heading">
                <div className="db-panel-heading">
                  <div>
                    <p className="db-kicker">HÀNG ĐỢI ƯU TIÊN</p>
                    <h2 id="priority-heading">Việc cần xử lý</h2>
                  </div>
                  <span className="db-count-badge">{priorityItems.length} nhóm</span>
                </div>
                {priorityItems.length > 0 ? (
                  <div className="db-queue">
                    {priorityItems.map((item) => {
                      const content = (
                        <>
                          <span className={`db-queue-icon ${item.tone}`}>
                            <item.icon aria-hidden="true" size={17} />
                          </span>
                          <span className="db-queue-label">
                            <strong>{item.label}</strong>
                            <small>{item.note}</small>
                          </span>
                          <span className="db-queue-count">{item.count}</span>
                          {navigation.includes(item.href) ? (
                            <ArrowUpRight aria-hidden="true" size={16} />
                          ) : (
                            <small className="db-readonly">Chỉ xem</small>
                          )}
                        </>
                      );
                      return navigation.includes(item.href) ? (
                        <Link href={item.href} key={item.label}>
                          {content}
                        </Link>
                      ) : (
                        <div key={item.label}>{content}</div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="db-panel-state">
                    <CircleCheckBig aria-hidden="true" size={32} color="#059669" />
                    <strong>Vận hành thông suốt · Mọi việc đã hoàn tất</strong>
                    <p>Không có mục chờ xử lý tại thời điểm này.</p>
                  </div>
                )}
                <p className="db-panel-footnote">
                  Các nhóm có thể trùng nhau, không cộng thành tổng người/việc. Chưa check-out không tự đồng nghĩa quên ra hoặc vắng.
                </p>
              </section>
            </DashboardAttendancePanels>
          </div>

          <aside className="db-bottom-strip" aria-label="Theo dõi và nguồn dữ liệu">
            {metrics.slice(4).map((metric) => {
              const val = summary[metric.key];
              const content = (
                <>
                  <span className="db-small-icon">
                    <metric.icon size={19} aria-hidden="true" />
                  </span>
                  <span>
                    {metric.label}
                    <small>{metric.note}</small>
                  </span>
                  <strong>{typeof val === 'number' ? <AnimatedNumber value={val} /> : '—'}</strong>
                </>
              );
              return navigation.includes(metric.href) ? (
                <Link href={metric.href} key={metric.key} className="db-bottom-item">
                  {content}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              ) : (
                <div key={metric.key} className="db-bottom-item">
                  {content}
                </div>
              );
            })}
            <div className="db-source-note">
              <strong>Dữ liệu thật, cùng nguồn báo cáo</strong>
              <p>
                Hồ sơ, đơn chờ, phiếu và thông báo theo trạng thái hiện tại; đơn chờ tính mọi ngày. Chấm công chưa đồng nghĩa đủ công, không tự tính lương.
              </p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
