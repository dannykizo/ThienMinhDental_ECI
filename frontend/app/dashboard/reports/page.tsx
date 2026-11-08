'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Users,
  Clock,
  TrendingUp,
  CalendarOff,
  Check,
  Printer,
  Search,
  CalendarRange,
  FileText,
  ShieldAlert,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { EmptyState, LoadingState, Notice, PageHeader, Pagination, StatusBadge, ToastNotice, formatDate } from '@/components/admin-ui';
import { ApiError, apiDownload, apiRequest, getAdminSession, type SessionUser } from '@/lib/auth-api';
import './reports.css';

interface ReportRow {
  attendanceType: string | null;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  departmentName: string | null;
  workDate: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  status: string;
  riskFlags: string[];
  adjustmentCount: number;
  workedMinutes: number;
  requiredWorkMinutes: number;
  overtimeMinutes: number;
  isFullWorkday: boolean;
}

interface ReportSummary {
  officeDays: number;
  fieldDays: number;
  scheduledDays: number;
  employeeCount: number;
  presentDays: number;
  businessTripDays: number;
  leaveDays: number;
  partialLeaveDays: number;
  incompleteDays: number;
  absentDays: number;
  reviewDays: number;
  totalWorkedMinutes: number;
  totalOvertimeMinutes: number;
  openExplanationCount: number;
  pendingLeaveCount: number;
  pendingOvertimeCount: number;
  incompleteBlockerCount: number;
  blockerCount: number;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
}

interface Department {
  id: string;
  name: string;
}

interface AttendancePeriod {
  id: string | null;
  periodMonth: string;
  status: 'OPEN' | 'LOCKED';
  lockedAt: string | null;
  lockedByName: string | null;
  reopenedAt: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
  revision: number;
}

interface ReportVersion {
  revision: number;
  lockedAt: string;
  lockedByName: string;
}

interface ReportDocument {
  rows: ReportRow[];
  summary: ReportSummary;
  period: AttendancePeriod;
  versions: ReportVersion[];
  source: 'LIVE' | 'SNAPSHOT';
  revision: number | null;
  lockedAt: string | null;
  lockedByName: string | null;
  warnings?: string[];
}

const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

const exportsList = [
  {
    path: 'monthly',
    title: 'Bảng công tháng',
    filename: 'bang-cong',
    description: 'Tổng hợp, ma trận ngày, chi tiết giờ vào/ra và đối soát công toàn diện.',
    icon: CalendarRange,
    theme: 'theme-purple',
  },
  {
    path: 'leave',
    title: 'Nghỉ phép & số dư',
    filename: 'nghi-phep-so-du',
    description: 'Đơn phép, quỹ năm tại thời điểm lấy dữ liệu và điều chỉnh quỹ chi tiết.',
    icon: FileText,
    theme: 'theme-teal',
  },
  {
    path: 'overtime',
    title: 'Phiếu tăng ca OT',
    filename: 'ot',
    description: 'Giờ đề nghị, giờ đã duyệt, tuyến phê duyệt 2 bước và lịch sử xử lý.',
    icon: Clock,
    theme: 'theme-orange',
  },
  {
    path: 'explanations',
    title: 'Giải trình & điều chỉnh',
    filename: 'giai-trinh-dieu-chinh',
    description: 'Đơn giải trình, minh chứng xác thực, giá trị sửa công và audit log bảo mật.',
    icon: ShieldAlert,
    theme: 'theme-indigo',
  },
];

function AnimatedNumber({ value }: { value: number | string }) {
  const [display, setDisplay] = useState(0);
  const target = typeof value === 'number' ? value : parseInt(value, 10) || 0;

  useEffect(() => {
    const start = 0;
    const duration = 650;
    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(start + (target - start) * ease);
      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [target]);

  return <span className="tabular-nums">{display}</span>;
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [period, setPeriod] = useState<AttendancePeriod | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState('');
  const [document, setDocument] = useState<ReportDocument | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [downloading, setDownloading] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [inTableSearch, setInTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);

  const downloadInProgress = useRef(false);
  const requestNumber = useRef(0);

  function query(selected = month): string {
    const params = new URLSearchParams({ month: selected });
    if (employeeId) params.set('employeeId', employeeId);
    if (departmentId) params.set('departmentId', departmentId);
    if (revision) params.set('revision', revision);
    return params.toString();
  }

  async function load(selected = month): Promise<void> {
    const params = query(selected);
    const request = ++requestNumber.current;
    let result: ReportDocument;
    try {
      result = await apiRequest<ReportDocument>(`/reporting/monthly/document?${params}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'REPORT_SNAPSHOT_REQUIRED') {
        const state = await apiRequest<AttendancePeriod>(`/reporting/periods/${selected}`);
        if (request === requestNumber.current) setPeriod(state);
      }
      throw caught;
    }
    if (request !== requestNumber.current) return;
    setRows(result.rows);
    setSummary(result.summary);
    setPeriod(result.period);
    setDocument(result);
    setLoadedQuery(params);
    setTablePage(1);
  }

  useEffect(() => {
    let active = true;
    const request = ++requestNumber.current;
    const report = apiRequest<ReportDocument>(`/reporting/monthly/document?month=${currentMonth}`).catch((caught) => {
      if (active && request === requestNumber.current) {
        setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo.');
      }
      return null;
    });

    Promise.all([
      report,
      apiRequest<Employee[]>('/employees'),
      apiRequest<Department[]>('/employees/lookups/departments'),
      getAdminSession(),
      apiRequest<AttendancePeriod>(`/reporting/periods/${currentMonth}`),
    ])
      .then(([result, employeeRows, departmentRows, user, state]) => {
        if (!active) return;
        setEmployees(employeeRows);
        setDepartments(departmentRows);
        setSession(user);
        if (request !== requestNumber.current) return;
        setPeriod(result?.period ?? state);
        if (result) {
          setRows(result.rows);
          setSummary(result.summary);
          setDocument(result);
          setLoadedQuery(`month=${currentMonth}`);
        }
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể tổng hợp báo cáo tháng.');
      });

    return () => {
      active = false;
    };
  }, []);

  async function filter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setError('');
    setRows(null);
    setSummary(null);
    setLoadedQuery('');
    try {
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo.');
    }
  }

  async function lockPeriod(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving || !ready || revision) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiRequest<AttendancePeriod>(`/reporting/periods/${month}/lock`, {
        method: 'POST',
        body: JSON.stringify({ reason: String(form.get('reason') || '').trim() || undefined }),
      });
      setPeriod(updated);
      setLoadedQuery('');
      setMessage(`Đã chốt kỳ công ${month}, phiên bản ${updated.revision}. Bản lưu giữ nguyên khi hồ sơ bị sửa/xóa.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể chốt kỳ công.');
    } finally {
      setSaving(false);
    }
  }

  async function reopenPeriod(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving || (!ready && !legacyLocked)) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiRequest<AttendancePeriod>(`/reporting/periods/${month}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: form.get('reason') }),
      });
      setPeriod(updated);
      setLoadedQuery('');
      formElement.reset();
      setMessage(`Đã mở lại kỳ công ${month}; bản đã chốt vẫn được giữ và lý do đã lưu audit.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể mở lại kỳ công.');
    } finally {
      setSaving(false);
    }
  }

  const blockers = summary?.blockerCount ?? 0;
  const canReopen = session?.roles.includes('CHIEF_ACCOUNTANT') ?? false;
  const ready = loadedQuery === query() && rows !== null && summary !== null;
  const periodKnown = period?.periodMonth === `${month}-01`;
  const legacyLocked = periodKnown && period?.status === 'LOCKED' && period.revision === 0;
  const exportParams = new URLSearchParams(loadedQuery);
  if (document?.source === 'SNAPSHOT' && document.revision) exportParams.set('revision', String(document.revision));

  async function download(item: typeof exportsList[number]): Promise<void> {
    if (!ready || saving || downloadInProgress.current) return;
    const selectedMonth = month;
    const params = exportParams.toString();
    downloadInProgress.current = true;
    setDownloading(item.path);
    setError('');
    setMessage('');

    try {
      const blob = await apiDownload(`/reporting/${item.path}/export?${params}`);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${item.filename}-${selectedMonth}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);

      setDownloadSuccess(item.path);
      window.setTimeout(() => setDownloadSuccess(null), 2500);
      setMessage(`Đã xuất thành công ${item.title} · ${selectedMonth}. Vui lòng kiểm tra các sheet đối soát.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải Excel. Hãy thử lại.');
    } finally {
      downloadInProgress.current = false;
      setDownloading('');
    }
  }

  // Visual Attendance Completion & Distribution calculations
  const totalDays = summary?.scheduledDays ?? 0;
  const officeDays = summary?.officeDays ?? 0;
  const fieldDays = summary?.fieldDays ?? 0;
  const leaveDays = summary?.leaveDays ?? 0;
  const incompleteDays = summary?.incompleteDays ?? 0;

  const attendanceRate = totalDays > 0 ? Math.min(100, Math.round(((officeDays + fieldDays) / totalDays) * 100)) : 0;
  const officePct = totalDays > 0 ? (officeDays / totalDays) * 100 : 0;
  const fieldPct = totalDays > 0 ? (fieldDays / totalDays) * 100 : 0;
  const leavePct = totalDays > 0 ? (leaveDays / totalDays) * 100 : 0;
  const incompletePct = totalDays > 0 ? Math.max(0, 100 - (officePct + fieldPct + leavePct)) : 0;

  // Filter rows locally for high performance in-table search
  const filteredRows = (rows ?? []).filter((r) => {
    if (!inTableSearch.trim()) return true;
    const search = inTableSearch.trim().toLowerCase();
    return (
      r.fullName.toLowerCase().includes(search) ||
      r.employeeCode.toLowerCase().includes(search) ||
      (r.departmentName && r.departmentName.toLowerCase().includes(search)) ||
      r.workDate.includes(search)
    );
  });

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(tablePage, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="module-page report-page">
      <PageHeader
        eyebrow="R12 / BÁO CÁO & ĐỐI SOÁT"
        title="Báo cáo, Thống kê & Khóa sổ tháng"
        description="Xuất dữ liệu Excel đối soát kế toán và nhân sự theo chuẩn trắng sứ viền mỏng. Dữ liệu chưa hoàn tất vẫn xuất được kèm nhận diện; không tính lương."
      />

      {/* Global Notices */}
      {!ready && rows !== null && (
        <Notice kind="info">Bộ lọc đã thay đổi. Bấm &quot;Tổng hợp báo cáo&quot; để tải đúng dữ liệu trước khi xuất hoặc chốt kỳ.</Notice>
      )}

      {ready && document && (
        <Notice kind="info">
          {document.source === 'SNAPSHOT'
            ? `Đang xem bản lưu v${document.revision}, chốt bởi ${document.lockedByName} lúc ${formatDate(document.lockedAt)}. Bản này giữ nguyên đối soát bất biến.`
            : 'Đang xem số liệu tạm tính theo thời gian thực của kỳ đang mở.'}{' '}
          Nghỉ một phần được thống kê độc lập, không coi là một ngày phép trọn vẹn. Kế toán tự tổng hợp tính lương.
        </Notice>
      )}

      {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
      {error && <Notice kind="error">{error}</Notice>}
      {document?.warnings?.map((warning) => (
        <Notice key={warning} kind="info">
          {warning}
        </Notice>
      ))}

      {period && periodKnown && (
        <Notice kind={period.status === 'LOCKED' ? 'success' : 'info'}>
          <strong>
            Kỳ {month}: {period.status === 'LOCKED' ? 'ĐÃ KHÓA SỔ' : 'ĐANG MỞ'}.
          </strong>
          {period.lockedAt && ` Chốt bởi ${period.lockedByName ?? 'người dùng hệ thống'} lúc ${formatDate(period.lockedAt)}.`}
          {period.reopenedAt &&
            period.status === 'OPEN' &&
            ` Mở lại bởi ${period.reopenedByName ?? 'Kế toán trưởng'} lúc ${formatDate(period.reopenedAt)}: ${period.reopenReason}.`}
        </Notice>
      )}

      <div className="report-workspace">
        {/* 1. Filter Toolbar (Pure Porcelain Bar) */}
        <div className="rpt-toolbar-card">
          <form className="rpt-toolbar-form" onSubmit={filter}>
            <div className="rpt-toolbar-field">
              <label>Kỳ công (Tháng)</label>
              <input
                type="month"
                value={month}
                disabled={saving}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setRevision('');
                  setDocument(null);
                }}
              />
            </div>

            <div className="rpt-toolbar-field">
              <label>Phòng ban</label>
              <select
                value={departmentId}
                disabled={saving}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rpt-toolbar-field">
              <label>Nhân viên</label>
              <select
                value={employeeId}
                disabled={saving}
                onChange={(event) => setEmployeeId(event.target.value)}
              >
                <option value="">Tất cả nhân viên</option>
                {employees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.employeeCode} · {item.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="rpt-toolbar-actions">
              <button type="submit" className="rpt-btn-submit" disabled={saving}>
                <Filter size={16} />
                <span>Tổng hợp báo cáo</span>
              </button>
              <button
                type="button"
                className="rpt-btn-print"
                onClick={() => window.print()}
                title="In hoặc Lưu PDF báo cáo kiểm toán"
              >
                <Printer size={16} />
                <span>In / PDF</span>
              </button>
            </div>
          </form>

          {document && document.versions.length > 0 && (
            <div className="rpt-version-row">
              <span>Phiên bản snapshot:</span>
              <select
                value={revision}
                disabled={saving}
                onChange={(event) => setRevision(event.target.value)}
              >
                <option value="">Hiện tại — kỳ mở hoặc bản chốt mới nhất</option>
                {document.versions.map((item) => (
                  <option key={item.revision} value={item.revision}>
                    Bản chốt v{item.revision} · {formatDate(item.lockedAt)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 2. KPI Metrics Grid (White Porcelain Tiles) */}
        {summary && (
          <section className="rpt-metrics-grid" aria-label="Tổng hợp chỉ số báo cáo">
            <div className="rpt-metric-tile">
              <div className="rpt-metric-header">
                <p className="rpt-metric-label">Tổng nhân sự</p>
                <span className="rpt-metric-icon">
                  <Users size={18} />
                </span>
              </div>
              <strong className="rpt-metric-value">
                <AnimatedNumber value={summary.employeeCount} />
              </strong>
              <p className="rpt-metric-sub">{summary.scheduledDays} ngày công theo lịch</p>
            </div>

            <div className="rpt-metric-tile tone-teal">
              <div className="rpt-metric-header">
                <p className="rpt-metric-label">Tổng giờ làm việc</p>
                <span className="rpt-metric-icon">
                  <Clock size={18} />
                </span>
              </div>
              <strong className="rpt-metric-value">{hours(summary.totalWorkedMinutes)}</strong>
              <p className="rpt-metric-sub">
                {summary.officeDays} ngày VP · {summary.fieldDays} ngày hiện trường
              </p>
            </div>

            <div className="rpt-metric-tile tone-orange">
              <div className="rpt-metric-header">
                <p className="rpt-metric-label">Tăng ca OT đã duyệt</p>
                <span className="rpt-metric-icon">
                  <TrendingUp size={18} />
                </span>
              </div>
              <strong className="rpt-metric-value">{hours(summary.totalOvertimeMinutes)}</strong>
              <p className="rpt-metric-sub">Chỉ cộng từ phiếu OT có quyết định duyệt</p>
            </div>

            <div className="rpt-metric-tile tone-amber">
              <div className="rpt-metric-header">
                <p className="rpt-metric-label">Nghỉ phép & Vắng</p>
                <span className="rpt-metric-icon">
                  <CalendarOff size={18} />
                </span>
              </div>
              <strong className="rpt-metric-value">
                <AnimatedNumber value={summary.leaveDays} /> <small style={{ fontSize: '0.9rem' }}>ngày</small>
              </strong>
              <p className="rpt-metric-sub">{summary.partialLeaveDays} ngày nghỉ một phần (không quy đổi)</p>
            </div>
          </section>
        )}

        {/* 3. Visual Attendance Progress & Analytics Bar */}
        {summary && (
          <div className="rpt-progress-card">
            <div className="rpt-progress-header">
              <div className="rpt-progress-title">
                <CheckCircle2 size={18} className="text-emerald" />
                <h3>Phân bổ hình thức & Tỷ lệ chuyên cần</h3>
              </div>
              <span className="rpt-rate-pill">
                Tỷ lệ hiện diện: {attendanceRate}%
              </span>
            </div>

            {/* Multi-segment Progress Bar */}
            <div className="rpt-progress-bar-wrap" title={`Văn phòng: ${officeDays}, Hiện trường: ${fieldDays}, Phép: ${leaveDays}`}>
              <div className="rpt-progress-segment rpt-seg-office" style={{ width: `${officePct}%` }} />
              <div className="rpt-progress-segment rpt-seg-field" style={{ width: `${fieldPct}%` }} />
              <div className="rpt-progress-segment rpt-seg-leave" style={{ width: `${leavePct}%` }} />
              <div className="rpt-progress-segment rpt-seg-incomplete" style={{ width: `${incompletePct}%` }} />
            </div>

            {/* Legend */}
            <div className="rpt-progress-legend">
              <div className="rpt-legend-item">
                <span className="rpt-legend-dot dot-office" />
                <span>Văn phòng</span>
                <strong className="rpt-legend-count">{officeDays}</strong>
              </div>
              <div className="rpt-legend-item">
                <span className="rpt-legend-dot dot-field" />
                <span>Hiện trường (Công tác)</span>
                <strong className="rpt-legend-count">{fieldDays}</strong>
              </div>
              <div className="rpt-legend-item">
                <span className="rpt-legend-dot dot-leave" />
                <span>Nghỉ phép</span>
                <strong className="rpt-legend-count">{leaveDays}</strong>
              </div>
              {incompleteDays > 0 && (
                <div className="rpt-legend-item">
                  <span className="rpt-legend-dot dot-incomplete" />
                  <span>Thiếu công / Vắng</span>
                  <strong className="rpt-legend-count">{incompleteDays}</strong>
                </div>
              )}
            </div>

            {/* Blocker Readiness Status */}
            {blockers > 0 ? (
              <div className="notice notice-warning" style={{ margin: 0, padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={18} className="text-warning flex-shrink-0" />
                <span style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                  <strong>Chưa đủ điều kiện khóa sổ:</strong> Còn {summary.incompleteBlockerCount} ngày thiếu check-out,{' '}
                  {summary.openExplanationCount} giải trình, {summary.pendingLeaveCount} đơn nghỉ và{' '}
                  {summary.pendingOvertimeCount} phiếu OT chưa duyệt. (Vẫn cho phép xuất Excel đối soát).
                </span>
              </div>
            ) : (
              <div className="notice notice-success" style={{ margin: 0, padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={18} className="text-emerald flex-shrink-0" />
                <span style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                  <strong>Đủ điều kiện khóa sổ:</strong> Toàn bộ đơn từ, giải trình và giờ công trong tháng đã được xử lý hoàn tất.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 4. Instant Feedback Excel Export Cards */}
        <section className="rpt-export-section" aria-label="Xuất dữ liệu Excel">
          <div className="rpt-export-top">
            <span className="rpt-export-top-icon">
              <FileSpreadsheet size={24} />
            </span>
            <div>
              <h2>Xuất dữ liệu Excel chuẩn kế toán</h2>
              <p>
                {ready
                  ? `Theo dữ liệu đã tổng hợp · Kỳ ${month}${document?.source === 'SNAPSHOT' ? ` · Bản chốt v${document.revision}` : ' · Tạm tính'}`
                  : 'Vui lòng chọn bộ lọc và bấm "Tổng hợp báo cáo" trước khi xuất.'}
              </p>
            </div>
          </div>

          <div className="rpt-export-grid">
            {exportsList.map((item) => {
              const isDownloading = downloading === item.path;
              const isSuccess = downloadSuccess === item.path;

              return (
                <article className={`rpt-export-card ${item.theme}`} key={item.path}>
                  <div className="rpt-export-card-body">
                    <div className="rpt-export-card-header">
                      <span className="rpt-export-badge-icon">
                        <item.icon size={16} />
                      </span>
                      <h3>{item.title}</h3>
                    </div>
                    <p>{item.description}</p>
                  </div>

                  <button
                    type="button"
                    className={`rpt-btn-download ${isSuccess ? 'is-success' : ''}`}
                    disabled={!ready || saving || Boolean(downloading)}
                    onClick={() => void download(item)}
                  >
                    {isDownloading ? (
                      <>
                        <LoaderCircle size={16} className="workflow-spin" />
                        <span>Đang tạo Excel…</span>
                      </>
                    ) : isSuccess ? (
                      <>
                        <Check size={16} strokeWidth={2.8} />
                        <span>Đã tải xong!</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>Tải Excel</span>
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* 5. Period Lock & Reopen Accordion Card */}
        {period !== null && (ready || legacyLocked) && (
          <div className="rpt-lock-panel">
            {period.status === 'OPEN' ? (
              <details>
                <summary>
                  <Lock size={16} className="text-brand" />
                  <span>Khóa sổ & Chốt kỳ công {month} (Audit Trail)</span>
                </summary>
                <form className="form-grid compact rpt-lock-form" onSubmit={lockPeriod}>
                  <label>
                    Lý do / ghi chú chốt kỳ (không bắt buộc)
                    <input
                      name="reason"
                      minLength={5}
                      maxLength={2000}
                      placeholder="Ví dụ: Đã hoàn tất đối soát số liệu lương tháng"
                    />
                  </label>
                  <button
                    className="primary-button form-action"
                    disabled={saving || blockers > 0 || Boolean(revision)}
                  >
                    {saving ? 'Đang xử lý…' : 'Xác nhận chốt kỳ công'}
                  </button>
                </form>
              </details>
            ) : canReopen ? (
              <details>
                <summary>
                  <Unlock size={16} className="text-warning" />
                  <span>Mở lại kỳ công đã khóa — Quyền Kế toán trưởng</span>
                </summary>
                <form className="form-grid compact rpt-lock-form" onSubmit={reopenPeriod}>
                  <label>
                    Lý do mở lại kỳ công (bắt buộc, lưu vết kiểm toán)
                    <textarea name="reason" minLength={5} maxLength={2000} required />
                  </label>
                  <button className="primary-button form-action" disabled={saving}>
                    {saving ? 'Đang xử lý…' : 'Xác nhận mở lại kỳ công'}
                  </button>
                </form>
              </details>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Lock size={16} className="text-muted" />
                <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                  Kỳ công đã khóa sổ bảo mật. Admin vui lòng liên hệ Kế toán trưởng nếu cần mở lại điều chỉnh.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 6. High-Density Porcelain Data Matrix Table */}
        {rows === null ? (
          error ? null : <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Chưa có dữ liệu báo cáo"
            description="Cần phân lịch làm việc cho nhân viên; hệ thống không tự tạo số liệu chấm công."
          />
        ) : (
          <div className="rpt-matrix-container">
            <div className="rpt-matrix-header">
              <div className="rpt-matrix-title">
                <h3>Bảng chi tiết chấm công & đối soát</h3>
                <span className="rpt-matrix-count">{filteredRows.length} bản ghi</span>
              </div>

              <div className="rpt-matrix-search">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Lọc nhanh tên, mã NV, phòng ban…"
                  value={inTableSearch}
                  onChange={(e) => {
                    setInTableSearch(e.target.value);
                    setTablePage(1);
                  }}
                />
              </div>
            </div>

            <div className="rpt-matrix-table-wrap">
              <table className="rpt-matrix-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Nhân viên</th>
                    <th>Phòng ban</th>
                    <th>Hình thức</th>
                    <th>Vào / Ra</th>
                    <th>Giờ làm</th>
                    <th>OT duyệt</th>
                    <th>Trạng thái</th>
                    <th>Cảnh báo & Điều chỉnh</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={`${row.employeeId}-${row.workDate}`}>
                      <td className="rpt-td-date">{row.workDate}</td>
                      <td>
                        <div className="rpt-td-emp">
                          <span className="rpt-emp-code">{row.employeeCode}</span>
                          <span className="rpt-emp-name">{row.fullName}</span>
                        </div>
                      </td>
                      <td className="rpt-td-dept">{row.departmentName ?? '—'}</td>
                      <td>
                        {row.attendanceType === 'BUSINESS_TRIP' ? (
                          <span className="rpt-td-type-pill rpt-type-field">Hiện trường</span>
                        ) : row.attendanceType === 'OFFICE' ? (
                          <span className="rpt-td-type-pill rpt-type-office">Văn phòng</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="rpt-td-time">
                        {row.checkedInAt ? formatDate(row.checkedInAt) : '—'}
                        <br />
                        {row.checkedOutAt ? formatDate(row.checkedOutAt) : '—'}
                      </td>
                      <td className="rpt-td-hours">
                        {hours(row.workedMinutes)}
                        <span style={{ color: 'var(--muted)', fontWeight: 'normal', fontSize: '0.74rem' }}>
                          {' '}/ {hours(row.requiredWorkMinutes)}
                        </span>
                      </td>
                      <td className="rpt-td-ot">
                        {row.overtimeMinutes > 0 ? hours(row.overtimeMinutes) : '0m'}
                      </td>
                      <td>
                        <StatusBadge value={row.status} />
                      </td>
                      <td>
                        <div className="rpt-td-risk">
                          {row.riskFlags.map((flag) => (
                            <span key={flag} className="rpt-risk-pill">
                              {flag}
                            </span>
                          ))}
                          {row.adjustmentCount > 0 && (
                            <span className="rpt-adjust-pill">
                              {row.adjustmentCount} điều chỉnh
                            </span>
                          )}
                          {row.riskFlags.length === 0 && row.adjustmentCount === 0 && (
                            <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRows.length > pageSize && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line-crisp)' }}>
                <Pagination
                  page={currentPage}
                  pageSize={pageSize}
                  total={filteredRows.length}
                  onPageChange={setTablePage}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
