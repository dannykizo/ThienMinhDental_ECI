'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarDays,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  RefreshCw,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, ToastNotice, formatDate } from '@/components/admin-ui';
import { apiRequest, apiUrl } from '@/lib/auth-api';
import { ExplanationsWorkspace } from '@/components/explanations-workspace';
import './attendance.css';

interface DailyRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  employeeType: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  riskFlags: string[];
  status: string;
  explanationStatus: string | null;
  workedMinutes: number;
  overtimeMinutes: number;
  requiredWorkMinutes: number;
  isFullWorkday: boolean;
  attendanceType: string | null;
}

interface AttendanceDetail {
  id: string;
  eventType: string;
  attendanceType: string;
  serverTime: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  fieldWorkContent: string | null;
  evidenceImageReference: string | null;
}

interface Adjustment {
  id: string;
  employeeCode: string;
  fullName: string;
  workDate: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  adjustedByName: string;
  createdAt: string;
}

interface Explanation {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  workDate: string;
  issueType: string;
  source: 'EMPLOYEE' | 'ADMIN_REQUEST';
  requestNote: string;
  status: string;
  dueAt: string | null;
  responseText: string | null;
  evidenceImageReference: string | null;
  evidenceCapturedAt: string | null;
  evidenceLatitude: number | null;
  evidenceLongitude: number | null;
  reviewNote: string | null;
  createdAt: string;
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    });
  } catch {
    return isoString;
  }
}

function formatFullTime(isoString: string | null): string {
  if (!isoString) return 'Chưa ghi nhận';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    });
  } catch {
    return isoString;
  }
}

function formatDuration(minutes: number): string {
  if (!minutes) return '0p';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}p`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

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

type AttendanceFilter = 'ALL' | 'ATTENDED' | 'FULL' | 'INCOMPLETE' | 'REVIEW';

export default function AttendancePage() {
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<AttendanceFilter>('ALL');
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{ employee: string; date: string; events: AttendanceDetail[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const detailRequest = useRef(0);

  async function openDetails(row: DailyRow): Promise<void> {
    const request = ++detailRequest.current;
    const selectedDate = date;
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const events = await apiRequest<AttendanceDetail[]>(`/attendance/daily/${row.employeeId}/details?date=${selectedDate}`);
      if (request === detailRequest.current) {
        setDetail({ employee: `${row.employeeCode} · ${row.fullName}`, date: selectedDate, events });
      }
    } catch (caught) {
      if (request === detailRequest.current) {
        setDetailError(caught instanceof Error ? caught.message : 'Không tải được chi tiết chấm công.');
      }
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  async function load(selected = date): Promise<void> {
    const [daily, audit, explanationRows] = await Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${selected}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
      apiRequest<Explanation[]>('/attendance/explanations'),
    ]);
    setRows(daily);
    setAdjustments(audit);
    setExplanations(explanationRows);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${today}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
      apiRequest<Explanation[]>('/attendance/explanations'),
    ])
      .then(([daily, audit, explanationRows]) => {
        setRows(daily);
        setAdjustments(audit);
        setExplanations(explanationRows);
      })
      .catch(() => setError('Không thể tải dữ liệu chấm công và giải trình.'));
  }, []);

  async function changeDateAndLoad(newDate: string): Promise<void> {
    setDate(newDate);
    setError('');
    setRows(null);
    ++detailRequest.current;
    setDetail(null);
    setDetailLoading(false);
    setDetailError('');
    try {
      await load(newDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu ngày đã chọn.');
    }
  }

  async function refresh(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    void changeDateAndLoad(date);
  }

  async function adjust(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest('/attendance/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.get('employeeId'),
          workDate: date,
          fieldName: form.get('fieldName'),
          newValue: String(form.get('newValue')),
          reason: form.get('reason'),
        }),
      });
      formElement.reset();
      setMessage('Đã ghi điều chỉnh công và lưu lịch sử audit.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể điều chỉnh chấm công.');
    } finally {
      setSaving(false);
    }
  }

  const metrics = useMemo(() => {
    if (!rows) {
      return { total: 0, attended: 0, full: 0, incomplete: 0, risks: 0, pending: 0 };
    }
    const attendedRows = rows.filter((r) => r.checkedInAt || r.checkedOutAt);
    const fullRows = rows.filter((r) => r.isFullWorkday || r.status === 'PRESENT');
    const incompleteRows = rows.filter(
      (r) => r.status === 'INCOMPLETE' || r.status === 'MISSING' || (r.checkedInAt && !r.checkedOutAt),
    );
    const riskRows = rows.filter((r) => r.riskFlags.length > 0);
    const pendingExplanations = explanations.filter((item) => ['REQUESTED', 'SUBMITTED'].includes(item.status)).length;
    return {
      total: rows.length,
      attended: attendedRows.length,
      full: fullRows.length,
      incomplete: incompleteRows.length,
      risks: riskRows.length,
      pending: pendingExplanations,
    };
  }, [rows, explanations]);

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      if (filter === 'ALL') return true;
      if (filter === 'ATTENDED') return Boolean(row.checkedInAt || row.checkedOutAt);
      if (filter === 'FULL') return row.isFullWorkday || row.status === 'PRESENT';
      if (filter === 'INCOMPLETE') {
        return row.status === 'INCOMPLETE' || row.status === 'MISSING' || (row.checkedInAt && !row.checkedOutAt);
      }
      if (filter === 'REVIEW') return row.riskFlags.length > 0 || row.status === 'CHECKED_IN';
      return true;
    });
  }, [rows, filter]);

  function getStatusBadge(row: DailyRow) {
    if (row.attendanceType === 'BUSINESS_TRIP' || row.status === 'BUSINESS_TRIP') {
      return (
        <span className="att-status-chip att-chip-trip" title="Công tác hiện trường">
          <CarFront size={12} />
          <span>Công tác</span>
        </span>
      );
    }
    if (row.status === 'LEAVE' || row.status === 'ON_LEAVE') {
      return (
        <span className="att-status-chip att-chip-leave" title="Nghỉ phép">
          <CalendarDays size={12} />
          <span>Nghỉ phép</span>
        </span>
      );
    }
    if (row.isFullWorkday || row.status === 'PRESENT') {
      return (
        <span className="att-status-chip att-chip-full" title="Đủ 100% công">
          <Check size={12} strokeWidth={2.4} />
          <span>Đủ công</span>
        </span>
      );
    }
    if (row.status === 'CHECKED_IN') {
      return (
        <span className="att-status-chip att-chip-working" title="Đang làm việc tại ca">
          <span className="att-pulse-dot" />
          <span>Đang làm việc</span>
        </span>
      );
    }
    if (row.status === 'INCOMPLETE' || row.status === 'MISSING' || (row.checkedInAt && !row.checkedOutAt)) {
      return (
        <span className="att-status-chip att-chip-incomplete" title="Thiếu chấm công hoặc chưa check-out">
          <AlertCircle size={12} />
          <span>{row.checkedInAt && !row.checkedOutAt ? 'Chưa ra về' : 'Thiếu công'}</span>
        </span>
      );
    }
    return (
      <span className="att-status-chip att-chip-none" title="Chưa có dữ liệu chấm công">
        <Clock3 size={12} />
        <span>Chưa chấm</span>
      </span>
    );
  }

  return (
    <div className="module-page attendance-page">
      <PageHeader
        eyebrow="ĐỐI SOÁT CHẤM CÔNG"
        title="Chấm công & Điểm danh"
        description="Ma trận đối soát chấm công hằng ngày, giám sát thời gian, cảnh báo vị trí và xử lý giải trình."
      />

      {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
      {error && <Notice kind="error">{error}</Notice>}

      {/* 4 Thẻ thống kê trắng sứ viền mỏng */}
      <section className="att-metrics-grid" aria-label="Tổng quan chấm công">
        <article className="att-metric-card" style={{ borderLeft: '3px solid var(--brand-primary)' }}>
          <div className="att-metric-top">
            <p>Nhân sự hoạt động</p>
            <div className="att-metric-icon" style={{ color: 'var(--brand-primary)', background: 'var(--brand-primary-light)' }}>
              <Users size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong>
            {rows === null ? '—' : <AnimatedNumber value={metrics.total} />}
          </strong>
          <span>Trong danh sách theo dõi</span>
        </article>

        <article className="att-metric-card" style={{ borderLeft: '3px solid #10b981' }}>
          <div className="att-metric-top">
            <p>Đã chấm công</p>
            <div className="att-metric-icon" style={{ color: '#059669', background: '#ecfdf5' }}>
              <UserCheck size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong style={{ color: '#059669' }}>
            {rows === null ? '—' : <AnimatedNumber value={metrics.attended} />}
          </strong>
          <span>{metrics.total > 0 ? `${Math.round((metrics.attended / metrics.total) * 100)}% tổng nhân sự` : '—'}</span>
        </article>

        <article className="att-metric-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="att-metric-top">
            <p>Cần đối soát</p>
            <div className="att-metric-icon" style={{ color: '#dc2626', background: '#fef2f2' }}>
              <AlertTriangle size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong style={{ color: metrics.risks > 0 ? '#dc2626' : 'var(--ink)' }}>
            {rows === null ? '—' : <AnimatedNumber value={metrics.risks} />}
          </strong>
          <span>Cảnh báo vị trí / thời gian</span>
        </article>

        <article className="att-metric-card" style={{ borderLeft: '3px solid var(--brand-accent)' }}>
          <div className="att-metric-top">
            <p>Giải trình đang mở</p>
            <div className="att-metric-icon" style={{ color: 'var(--brand-accent)', background: '#fff7ed' }}>
              <FileText size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong style={{ color: metrics.pending > 0 ? 'var(--brand-accent)' : 'var(--ink)' }}>
            {rows === null ? '—' : <AnimatedNumber value={metrics.pending} />}
          </strong>
          <span>Đơn cần xử lý trên hệ thống</span>
        </article>
      </section>

      {/* Toolbar điều hướng ngày và Quick Filter Chips */}
      <section className="att-toolbar-card" aria-label="Thanh công cụ chấm công">
        <div className="att-toolbar-primary">
          <div className="att-date-picker-wrap">
            <button
              type="button"
              className="att-date-nav-btn"
              title="Lùi 1 ngày"
              onClick={() => void changeDateAndLoad(shiftDate(date, -1))}
            >
              <ChevronLeft size={16} />
            </button>

            <form onSubmit={refresh} style={{ display: 'inline-flex' }}>
              <div className="att-date-input-field">
                <Calendar size={15} style={{ color: 'var(--brand-primary)' }} />
                <input
                  type="date"
                  aria-label="Chọn ngày làm việc"
                  value={date}
                  onChange={(e) => void changeDateAndLoad(e.target.value)}
                />
              </div>
            </form>

            <button
              type="button"
              className="att-date-nav-btn"
              title="Tiến 1 ngày"
              onClick={() => void changeDateAndLoad(shiftDate(date, 1))}
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              className={`att-date-quick-btn${date === getYesterday() ? ' is-active' : ''}`}
              onClick={() => void changeDateAndLoad(getYesterday())}
            >
              Hôm qua
            </button>
            <button
              type="button"
              className={`att-date-quick-btn${date === today ? ' is-active' : ''}`}
              onClick={() => void changeDateAndLoad(today)}
            >
              Hôm nay
            </button>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={rows === null}
            onClick={() => void changeDateAndLoad(date)}
            style={{ minHeight: 36, padding: '0 12px' }}
          >
            <RefreshCw size={14} /> Làm mới
          </button>
        </div>

        {/* Quick Filter Chips */}
        <div className="att-filter-chips" role="group" aria-label="Bộ lọc nhanh trạng thái chấm công">
          <button
            type="button"
            className={`att-chip-button${filter === 'ALL' ? ' is-active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            <span>Tất cả</span>
            <span className="att-chip-count">{rows === null ? '…' : metrics.total}</span>
          </button>

          <button
            type="button"
            className={`att-chip-button${filter === 'ATTENDED' ? ' is-active' : ''}`}
            onClick={() => setFilter('ATTENDED')}
          >
            <span className="att-chip-dot" style={{ background: '#3b82f6' }} />
            <span>Đã chấm công</span>
            <span className="att-chip-count">{rows === null ? '…' : metrics.attended}</span>
          </button>

          <button
            type="button"
            className={`att-chip-button${filter === 'FULL' ? ' is-active' : ''}`}
            onClick={() => setFilter('FULL')}
          >
            <span className="att-chip-dot" style={{ background: '#10b981' }} />
            <span>Đủ công</span>
            <span className="att-chip-count">{rows === null ? '…' : metrics.full}</span>
          </button>

          <button
            type="button"
            className={`att-chip-button${filter === 'INCOMPLETE' ? ' is-active' : ''}`}
            onClick={() => setFilter('INCOMPLETE')}
          >
            <span className="att-chip-dot" style={{ background: '#ef4444' }} />
            <span>Thiếu công / Chưa về</span>
            <span className="att-chip-count">{rows === null ? '…' : metrics.incomplete}</span>
          </button>

          <button
            type="button"
            className={`att-chip-button${filter === 'REVIEW' ? ' is-active' : ''}`}
            onClick={() => setFilter('REVIEW')}
          >
            <span className="att-chip-dot" style={{ background: '#f59e0b' }} />
            <span>Cần đối soát</span>
            <span className="att-chip-count">{rows === null ? '…' : metrics.risks}</span>
          </button>
        </div>
      </section>

      {/* Ma trận Chấm công Gọn gàng (Cuộn 2 chiều + Frozen First Column) */}
      <section className="att-matrix-card" aria-label="Ma trận chấm công">
        <header className="att-matrix-heading">
          <div>
            <h2>Ma trận chấm công chi tiết</h2>
            <p>Ngày {formatDate(date)} · Giờ máy chủ Việt Nam (GMT+7)</p>
          </div>
          <div className="att-matrix-badges">
            <span className="att-matrix-count-badge">
              {rows === null ? 'Đang tải…' : `${visibleRows.length} / ${rows.length} nhân sự`}
            </span>
          </div>
        </header>

        {rows === null ? (
          <LoadingState />
        ) : visibleRows.length === 0 ? (
          <EmptyState
            title="Không có dữ liệu phù hợp"
            description="Đổi ngày làm việc hoặc bộ lọc trạng thái; hệ thống hiển thị chính xác dữ liệu chấm công thực tế."
          />
        ) : (
          <div className="att-matrix-wrap">
            <table className="att-matrix-table">
              <thead>
                <tr>
                  <th className="att-col-pinned att-th-pinned">Nhân viên</th>
                  <th>Hình thức</th>
                  <th>Giờ vào</th>
                  <th>Giờ ra</th>
                  <th>Thời gian / OT</th>
                  <th>Trạng thái</th>
                  <th>Cảnh báo vị trí</th>
                  <th>Giải trình</th>
                  <th>Đối soát Admin</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isHovered = hoveredRowId === row.employeeId;
                  return (
                    <tr
                      key={row.employeeId}
                      className="att-interactive-row"
                      onMouseEnter={() => setHoveredRowId(row.employeeId)}
                      onMouseLeave={() => setHoveredRowId((curr) => (curr === row.employeeId ? null : curr))}
                    >
                      {/* Frozen First Column */}
                      <td className="att-col-pinned">
                        <div className="att-person-cell">
                          <span className="att-person-initial" aria-hidden="true">
                            {row.fullName.trim().slice(0, 1).toLocaleUpperCase('vi')}
                          </span>
                          <div className="att-person-info">
                            <strong>{row.fullName}</strong>
                            <div className="att-person-meta">
                              <span className="att-code-tag">{row.employeeCode}</span>
                              <span>·</span>
                              <span>{row.employeeType === 'OFFICE' ? 'Văn phòng' : 'Hiện trường'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Hình thức */}
                      <td>
                        <span style={{ fontSize: '.76rem', color: row.attendanceType === 'BUSINESS_TRIP' ? 'var(--brand-accent)' : 'var(--ink)' }}>
                          {row.attendanceType === 'OFFICE'
                            ? 'Văn phòng'
                            : row.attendanceType === 'BUSINESS_TRIP'
                              ? 'Hiện trường'
                              : '—'}
                        </span>
                      </td>

                      {/* Giờ vào (Check-in) with quick Tooltip */}
                      <td style={{ position: 'relative' }}>
                        <div className="att-time-cell">
                          {row.checkedInAt ? (
                            <span>{formatTime(row.checkedInAt)}</span>
                          ) : (
                            <span className="att-time-empty">—</span>
                          )}
                        </div>

                        {/* Hover Tooltip Xem nhanh */}
                        {isHovered && (
                          <div className="att-hover-popover" role="tooltip">
                            <strong>{row.fullName} ({row.employeeCode})</strong>
                            <div className="att-hover-popover-item">
                              <span>Check-in:</span>
                              <strong>{formatFullTime(row.checkedInAt)}</strong>
                            </div>
                            <div className="att-hover-popover-item">
                              <span>Check-out:</span>
                              <strong>{formatFullTime(row.checkedOutAt)}</strong>
                            </div>
                            <div className="att-hover-popover-item">
                              <span>Thời gian:</span>
                              <strong>{formatDuration(row.workedMinutes)} / {formatDuration(row.requiredWorkMinutes)}</strong>
                            </div>
                            {row.riskFlags.length > 0 && (
                              <div className="att-hover-popover-item" style={{ color: '#fca5a5' }}>
                                <span>Cảnh báo:</span>
                                <strong>{row.riskFlags.join(', ')}</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Giờ ra (Check-out) */}
                      <td>
                        <div className="att-time-cell">
                          {row.checkedOutAt ? (
                            <span>{formatTime(row.checkedOutAt)}</span>
                          ) : (
                            <span className="att-time-empty">—</span>
                          )}
                        </div>
                      </td>

                      {/* Thời gian làm việc / OT */}
                      <td>
                        <div className="att-duration-cell">
                          <strong>
                            {formatDuration(row.workedMinutes)} / {formatDuration(row.requiredWorkMinutes)}
                          </strong>
                          {row.overtimeMinutes > 0 && (
                            <span className="att-ot-badge">+{formatDuration(row.overtimeMinutes)} OT</span>
                          )}
                        </div>
                      </td>

                      {/* Trạng thái (Distinct Status Chip: Đủ công, Thiếu công, Công tác, Nghỉ phép) */}
                      <td>{getStatusBadge(row)}</td>

                      {/* Cảnh báo vị trí / thời gian */}
                      <td>
                        {row.riskFlags.length > 0 ? (
                          <span className="att-risk-tag">
                            <AlertTriangle size={11} />
                            <span>{row.riskFlags.join(', ')}</span>
                          </span>
                        ) : (
                          <span className="att-risk-ok">
                            <Check size={12} />
                            <span>Hợp lệ</span>
                          </span>
                        )}
                      </td>

                      {/* Giải trình */}
                      <td>
                        {row.explanationStatus ? (
                          <StatusBadge value={row.explanationStatus} />
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '.74rem' }}>Chưa có đơn</span>
                        )}
                      </td>

                      {/* Đối soát Admin */}
                      <td>
                        <button
                          type="button"
                          className="att-inspect-btn"
                          disabled={detailLoading}
                          onClick={() => void openDetails(row)}
                        >
                          <MapPin size={13} />
                          <span>Ảnh / GPS</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Loading & Error Thông báo */}
      {detailLoading && <LoadingState />}
      {detailError && <Notice kind="error">{detailError} Bấm lại nút Ảnh / vị trí để thử lại.</Notice>}

      {/* Modal / Drawer Chi tiết Đối soát Admin */}
      {detail && (
        <div className="att-detail-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="att-detail-dialog" role="dialog" aria-modal="true">
            <header className="att-detail-header">
              <div>
                <h3>Đối soát chi tiết chấm công</h3>
                <p>{detail.employee} · Ngày {formatDate(detail.date)}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Đóng chi tiết đối soát"
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="att-detail-body">
              <Notice kind="info">
                Tọa độ GPS và ảnh chụp xác thực phục vụ kiểm tra tính xác thực của sự kiện. Hệ thống không theo dõi GPS liên tục ngoài thời điểm phát sinh sự kiện.
              </Notice>

              {detail.events.length === 0 ? (
                <EmptyState title="Chưa có sự kiện chấm công" description="Không tìm thấy bản ghi check-in hoặc check-out nào của nhân sự trong ngày này." />
              ) : (
                detail.events.map((event) => (
                  <article key={event.id} className="att-event-card">
                    <div className="att-event-header">
                      <h4>
                        {event.eventType === 'CHECK_IN' ? 'Check-in (Vào ca)' : 'Check-out (Tan ca)'} · {event.attendanceType === 'OFFICE' ? 'Tại văn phòng' : 'Hiện trường'}
                      </h4>
                      <span style={{ fontSize: '.74rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDate(event.serverTime)}
                      </span>
                    </div>

                    <p style={{ margin: '4px 0', fontSize: '.78rem', color: 'var(--ink)' }}>
                      <strong>Vị trí GPS:</strong> {event.latitude != null && event.longitude != null ? `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}` : 'Chưa thu thập'}
                      {event.accuracyMeters != null ? ` (Sai số ±${Math.round(event.accuracyMeters)}m)` : ''}
                    </p>

                    {event.fieldWorkContent && (
                      <p style={{ margin: '4px 0', fontSize: '.78rem', whiteSpace: 'pre-wrap' }}>
                        <strong>Nội dung hiện trường:</strong> {event.fieldWorkContent}
                      </p>
                    )}

                    {event.evidenceImageReference && /^\/api\/attendance\/evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(event.evidenceImageReference) && (
                      <a
                        className="att-evidence-preview"
                        href={`${new URL(apiUrl).origin}${event.evidenceImageReference}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Sparkles size={14} /> Mở ảnh bằng chứng check-in có Timemark
                      </a>
                    )}
                  </article>
                ))
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="secondary-button" onClick={() => setDetail(null)}>
                  Đóng cửa sổ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Explanations Workspace */}
      <ExplanationsWorkspace onChanged={load} />

      {/* Tạo điều chỉnh chấm công có Audit Log */}
      <details className="editor-panel" style={{ border: '1px solid var(--line-crisp)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)' }}>
        <summary style={{ cursor: 'pointer', padding: '14px 18px', fontWeight: 600, fontSize: '.84rem', color: 'var(--ink)' }}>
          Tạo điều chỉnh chấm công có Audit Log
        </summary>
        <div style={{ padding: '0 18px 18px' }}>
          <Notice kind="info">
            Admin có quyền điều chỉnh công nhưng mọi thao tác đều ghi vết kiểm toán (Audit Log) bao gồm lý do, người thực hiện và giá trị cũ/mới.
          </Notice>
          <form className="form-grid" onSubmit={adjust} style={{ marginTop: 14 }}>
            <label>
              Nhân viên
              <select name="employeeId" required>
                <option value="">Chọn nhân viên</option>
                {rows?.map((row) => (
                  <option key={row.employeeId} value={row.employeeId}>
                    {row.employeeCode} · {row.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trường điều chỉnh
              <select name="fieldName">
                <option value="CHECK_IN_TIME">Giờ check-in</option>
                <option value="CHECK_OUT_TIME">Giờ check-out</option>
                <option value="DAY_STATUS">Trạng thái ngày</option>
              </select>
            </label>
            <label>
              Giá trị mới
              <input name="newValue" placeholder="VD: 2026-10-21T08:00:00Z hoặc PRESENT" required />
            </label>
            <label className="span-2">
              Lý do điều chỉnh (bắt buộc)
              <textarea minLength={5} name="reason" placeholder="VD: Nhân viên quên check-out do sự cố thiết bị tại phòng khám..." required />
            </label>
            <div className="form-actions span-2">
              <button className="primary-button" disabled={saving}>
                {saving ? 'Đang ghi nhận…' : 'Ghi điều chỉnh'}
              </button>
            </div>
          </form>
        </div>
      </details>

      {/* Lịch sử điều chỉnh (chỉ Admin) */}
      <section className="editor-panel" style={{ border: '1px solid var(--line-crisp)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)' }}>
        <h3 style={{ fontSize: '.95rem', fontWeight: 650, margin: '0 0 12px', color: 'var(--ink)' }}>
          Lịch sử điều chỉnh (Audit Log quản trị)
        </h3>
        {adjustments.length === 0 ? (
          <p className="muted-copy">Chưa có bản ghi điều chỉnh nào.</p>
        ) : (
          <div className="audit-list">
            {adjustments.map((item) => (
              <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-crisp)' }}>
                <strong style={{ fontSize: '.8rem', color: 'var(--ink)' }}>
                  {item.employeeCode} · {item.fullName} · {item.workDate} · {item.fieldName}
                </strong>
                <span style={{ display: 'block', fontSize: '.74rem', color: 'var(--muted)', marginTop: 3 }}>
                  {displayValue(item.oldValue)} → {displayValue(item.newValue)} · Lý do: {item.reason} · Người sửa: {item.adjustedByName} · {formatDate(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
