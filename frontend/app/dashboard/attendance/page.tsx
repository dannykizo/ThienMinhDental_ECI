'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  formatDate,
} from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface DailyRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  employeeType: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  riskFlags: string[];
  status: string;
  workedMinutes: number;
  overtimeMinutes: number;
  requiredWorkMinutes: number;
  isFullWorkday: boolean;
}

interface Adjustment {
  id: string;
  employeeId: string;
  workDate: string;
  fieldName: string;
  reason: string;
  createdAt: string;
}

const today = new Date().toLocaleDateString('en-CA');

const employeeTypeLabel: Record<string, string> = {
  OFFICE: 'Văn phòng',
  TECHNICAL: 'Kỹ thuật / Hiện trường',
};

export default function AttendancePage() {
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(selected = date): Promise<void> {
    const [daily, audit] = await Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${selected}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
    ]);
    setRows(daily);
    setAdjustments(audit);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<DailyRow[]>(`/attendance/daily?date=${today}`),
      apiRequest<Adjustment[]>('/attendance/adjustments'),
    ])
      .then(([daily, audit]) => {
        setRows(daily);
        setAdjustments(audit);
      })
      .catch(() => setError('Không thể tải bảng chấm công.'));
  }, []);

  async function filter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRows(null);
    await load();
  }

  async function adjust(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('newValue'));
    try {
      await apiRequest('/attendance/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.get('employeeId'),
          workDate: date,
          fieldName: form.get('fieldName'),
          newValue: raw,
          reason: form.get('reason'),
        }),
      });
      event.currentTarget.reset();
      setMessage('Đã ghi điều chỉnh công và cập nhật audit log bất biến.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể điều chỉnh.',
      );
    }
  }

  const totalEmployees = rows?.length ?? 0;
  const presentCount =
    rows?.filter(
      (r) => r.status === 'PRESENT' || r.status === 'CHECKED_OUT',
    ).length ?? 0;
  const lateCount =
    rows?.filter((r) => r.riskFlags.some((f) => f.includes('LATE'))).length ??
    0;
  const warningCount =
    rows?.filter((r) => r.riskFlags.length > 0).length ?? 0;

  return (
    <div className="module-page">
      <PageHeader
        description="Theo dõi dữ liệu chấm công theo thời gian thực tại chi nhánh và thực hiện điều chỉnh có lưu vết."
        eyebrow="ĐỐI SOÁT CHẤM CÔNG"
        title="Chấm công hàng ngày"
      />

      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {/* Daily Metrics Bar (Học hỏi từ Ảnh 2 & Ảnh 7) */}
      <section
        aria-label="Thống kê chấm công trong ngày"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        <article className="metric-card">
          <p>Tổng nhân viên</p>
          <strong>{totalEmployees}</strong>
          <span>Phân công trong ngày</span>
        </article>

        <article className="metric-card">
          <div className="metric-card-top">
            <p>Có mặt / Đã check-in</p>
            <span style={{ color: 'var(--emerald)' }}>✓</span>
          </div>
          <strong style={{ color: 'var(--emerald-dark)' }}>
            {presentCount}
          </strong>
          <span>Đã ghi nhận sự kiện</span>
        </article>

        <article className="metric-card">
          <div className="metric-card-top">
            <p>Đi muộn</p>
            <span style={{ color: 'var(--brand-gold)' }}>⚠️</span>
          </div>
          <strong style={{ color: lateCount > 0 ? '#b45309' : 'inherit' }}>
            {lateCount}
          </strong>
          <span>Vượt quá dung sai lịch</span>
        </article>

        <article className="metric-card">
          <div className="metric-card-top">
            <p>Cần đối soát / Cảnh báo</p>
            <span style={{ color: 'var(--brand-accent)' }}>⚡</span>
          </div>
          <strong style={{ color: warningCount > 0 ? '#ea580c' : 'inherit' }}>
            {warningCount}
          </strong>
          <span>Có cờ rủi ro GPS/giờ</span>
        </article>
      </section>

      <form className="toolbar" onSubmit={filter}>
        <label>
          Chọn ngày xem dữ liệu
          <input
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        </label>
        <button className="secondary-button">Xem dữ liệu ngày</button>
      </form>

      {rows === null ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          description="Chưa có nhân viên nào được phân công hoặc hoạt động trong ngày này."
          title="Chưa có dữ liệu chấm công"
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Hình thức</th>
                <th>Giờ vào (Check-in)</th>
                <th>Giờ ra (Check-out)</th>
                <th>Trạng thái</th>
                <th>Công / Tăng ca</th>
                <th>Cảnh báo / Rủi ro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeId}>
                  <td>
                    <strong>{row.employeeCode}</strong>
                    <div style={{ color: 'var(--ink)', fontWeight: 600 }}>
                      {row.fullName}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {employeeTypeLabel[row.employeeType] ?? row.employeeType}
                    </span>
                  </td>
                  <td>
                    <strong>{formatDate(row.checkedInAt)}</strong>
                  </td>
                  <td>
                    {row.checkedOutAt ? (
                      formatDate(row.checkedOutAt)
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                        (Chưa checkout)
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusBadge value={row.status} />
                  </td>
                  <td>
                    <strong>{row.workedMinutes}/{row.requiredWorkMinutes} phút</strong>
                    <div style={{ color: row.isFullWorkday ? 'var(--emerald-dark)' : 'var(--muted)', fontSize: '0.76rem' }}>
                      {row.isFullWorkday ? 'Đủ công' : 'Chưa đủ công'}{row.overtimeMinutes > 0 ? ` · OT ${row.overtimeMinutes} phút` : ''}
                    </div>
                  </td>
                  <td>
                    {row.riskFlags.length > 0 ? (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'var(--brand-gold-light)',
                          color: '#92400e',
                          fontWeight: 600,
                          fontSize: '0.74rem',
                        }}
                      >
                        ⚠️ {row.riskFlags.join(', ')}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--emerald-dark)', fontSize: '0.78rem' }}>
                        ✓ Hợp lệ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="editor-panel">
        <summary>+ Tạo điều chỉnh chấm công có Audit Log</summary>
        <form className="form-grid" onSubmit={adjust}>
          <label>
            Nhân viên cần điều chỉnh
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
            Trường cần điều chỉnh
            <select name="fieldName">
              <option value="CHECK_IN_TIME">Giờ check-in</option>
              <option value="CHECK_OUT_TIME">Giờ check-out</option>
              <option value="DAY_STATUS">Trạng thái ngày</option>
            </select>
          </label>
          <label>
            Giá trị mới
            <input
              name="newValue"
              placeholder="VD: 2026-09-19T08:00:00Z hoặc PRESENT"
              required
            />
          </label>
          <label className="span-2">
            Lý do điều chỉnh (bắt buộc theo quy định)
            <textarea
              minLength={5}
              name="reason"
              placeholder="Nhập lý do chi tiết để lưu vết audit…"
              required
            />
          </label>
          <button className="primary-button form-action">
            Ghi nhận điều chỉnh
          </button>
        </form>
      </details>

      <section className="subsection">
        <h2>Lịch sử điều chỉnh gần nhất (Audit Trail)</h2>
        {adjustments.length === 0 ? (
          <p className="muted">Chưa có điều chỉnh nào được ghi nhận.</p>
        ) : (
          <div className="audit-list">
            {adjustments.map((item) => (
              <div key={item.id}>
                <strong>
                  📅 Ngày {item.workDate} · Mục: {item.fieldName}
                </strong>
                <span>
                  <strong>Lý do:</strong> {item.reason} ({formatDate(item.createdAt)})
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
