'use client';

import {
  CalendarCheck,
  CalendarDays,
  Clock,
  CornerDownRight,
  Pencil,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  ToastNotice,
  formatDate,
} from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface DepartmentAssignment {
  id: string;
  branchName: string;
  departmentName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface Schedule {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requiredWorkMinutes: number;
  isActive: boolean;
  departmentAssignments: DepartmentAssignment[];
  employeeAssignmentCount: number;
  employeeAssignments: {
    id: string;
    employeeCode: string;
    fullName: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
}

interface Lookup {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  isActive: boolean;
}

interface AuditLog {
  id: string;
  resourceType: string;
  action: string;
  actorName: string;
  createdAt: string;
}

const dayNames: Record<number, string> = {
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
  7: 'CN',
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

export default function SchedulesPage() {
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [branches, setBranches] = useState<Lookup[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const [schedules, people, departmentRows, branchRows, auditRows] = await Promise.all([
      apiRequest<Schedule[]>('/work-schedules'),
      apiRequest<Employee[]>('/employees'),
      apiRequest<Lookup[]>('/employees/lookups/departments'),
      apiRequest<Lookup[]>('/employees/lookups/branches'),
      apiRequest<AuditLog[]>('/work-schedules/history'),
    ]);
    setItems(schedules);
    setEmployees(people.filter((row) => row.isActive));
    setDepartments(departmentRows.filter((row) => row.isActive));
    setBranches(branchRows.filter((row) => row.isActive));
    setHistory(auditRows);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => setError('Không thể tải cấu hình lịch làm việc.'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveSchedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingRef.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(editing ? `/work-schedules/${editing.id}` : '/work-schedules', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          weekdays: form.getAll('weekdays').map(Number),
          startTime: form.get('startTime'),
          endTime: form.get('endTime'),
          lateToleranceMinutes: Number(form.get('lateToleranceMinutes')),
          earlyLeaveToleranceMinutes: Number(form.get('earlyLeaveToleranceMinutes')),
          requiredWorkMinutes: Number(form.get('requiredWorkMinutes')),
        }),
      });
      setEditing(null);
      formElement.reset();
      setMessage(editing ? 'Đã cập nhật lịch làm việc.' : 'Đã tạo lịch làm việc.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu lịch làm việc.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function assignDepartment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingRef.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/work-schedules/${String(form.get('scheduleId'))}/department-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          branchId: form.get('branchId'),
          departmentId: form.get('departmentId'),
          effectiveFrom: form.get('effectiveFrom'),
          effectiveTo: form.get('effectiveTo') || undefined,
        }),
      });
      formElement.reset();
      setMessage('Đã áp dụng lịch cho phòng ban. Lịch cũ được lưu trong lịch sử.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể áp dụng lịch.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function assignEmployee(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (savingRef.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/work-schedules/${String(form.get('scheduleId'))}/employee-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.get('employeeId'),
          effectiveFrom: form.get('effectiveFrom'),
          effectiveTo: form.get('effectiveTo') || undefined,
        }),
      });
      formElement.reset();
      setMessage('Đã tạo ngoại lệ lịch cho nhân viên.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gán lịch cá nhân.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function toggle(item: Schedule): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/work-schedules/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      setMessage(item.isActive ? 'Đã tạm ngưng lịch.' : 'Đã kích hoạt lịch.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đổi trạng thái lịch.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const activeCount = items?.filter((item) => item.isActive).length ?? 0;

  return (
    <div className="module-page">
      <PageHeader
        eyebrow="CẤU HÌNH CA & LỊCH"
        title="Lịch làm việc & Ca trực"
        description="Admin cấu hình lịch theo chi nhánh và phòng ban; ngoại lệ cá nhân được ưu tiên khi tính công."
      />
      {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
      {error && <Notice kind="error">{error}</Notice>}
      {saving && <p role="status" style={{ fontSize: '0.82rem', color: 'var(--brand-primary)' }}>Đang lưu cấu hình lịch…</p>}

      {/* KPI Summary Tiles */}
      <section aria-label="Tóm tắt lịch" className="cfg-metric-grid">
        <article className="cfg-metric-tile">
          <div className="cfg-metric-tile-header">
            <span className="cfg-metric-tile-label">Tổng khung lịch</span>
            <span className="cfg-metric-tile-icon cfg-icon-purple">
              <CalendarDays size={18} />
            </span>
          </div>
          <p className="cfg-metric-tile-value tabular-nums">{items?.length ?? 0}</p>
          <span className="cfg-metric-tile-sub">Cấu hình trong toàn hệ thống</span>
        </article>

        <article className="cfg-metric-tile">
          <div className="cfg-metric-tile-header">
            <span className="cfg-metric-tile-label">Đang hiệu lực</span>
            <span className="cfg-metric-tile-icon cfg-icon-teal">
              <CalendarCheck size={18} />
            </span>
          </div>
          <p className="cfg-metric-tile-value tabular-nums">{activeCount}</p>
          <span className="cfg-metric-tile-sub">Sẵn sàng áp dụng cho nhân sự</span>
        </article>

        <article className="cfg-metric-tile">
          <div className="cfg-metric-tile-header">
            <span className="cfg-metric-tile-label">Chuẩn đủ công</span>
            <span className="cfg-metric-tile-icon cfg-icon-amber">
              <Clock size={18} />
            </span>
          </div>
          <p className="cfg-metric-tile-value tabular-nums">8h / ca</p>
          <span className="cfg-metric-tile-sub">Mặc định 480 phút làm việc</span>
        </article>
      </section>

      {/* Split Editors: Tạo/Sửa lịch & Áp dụng phòng ban */}
      <div className="split-editors">
        <details className="cfg-panel" open>
          <summary>
            <span className="summary-label">
              {editing ? <Pencil aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}
              {editing ? `Chỉnh sửa · ${editing.name}` : 'Tạo khung lịch mới'}
            </span>
          </summary>
          <form className="form-grid compact" key={editing?.id ?? 'new'} onSubmit={saveSchedule}>
            <label className="span-2">
              Tên lịch
              <input
                defaultValue={editing?.name ?? ''}
                maxLength={120}
                name="name"
                placeholder="VD: Ca hành chính chuẩn"
                required
              />
            </label>

            <fieldset className="span-2 weekday-field" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--ink-secondary)', marginBottom: 4 }}>
                Ngày làm việc trong tuần
              </legend>
              <div className="cfg-weekday-grid">
                {Object.entries(dayNames).map(([value, label]) => (
                  <label className="cfg-weekday-pill" key={value}>
                    <input
                      defaultChecked={editing ? editing.weekdays.includes(Number(value)) : Number(value) <= 5}
                      name="weekdays"
                      type="checkbox"
                      value={value}
                    />
                    <span className="cfg-weekday-pill-tag">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label>
              Giờ bắt đầu
              <input
                defaultValue={editing?.startTime.slice(0, 5) ?? '08:00'}
                name="startTime"
                required
                type="time"
              />
            </label>
            <label>
              Giờ kết thúc
              <input
                defaultValue={editing?.endTime.slice(0, 5) ?? '17:00'}
                name="endTime"
                required
                type="time"
              />
            </label>
            <label>
              Dung sai đi muộn (phút)
              <input
                defaultValue={editing?.lateToleranceMinutes ?? 3}
                max="180"
                min="0"
                name="lateToleranceMinutes"
                required
                type="number"
              />
            </label>
            <label>
              Dung sai về sớm (phút)
              <input
                defaultValue={editing?.earlyLeaveToleranceMinutes ?? 0}
                max="180"
                min="0"
                name="earlyLeaveToleranceMinutes"
                required
                type="number"
              />
            </label>
            <label className="span-2">
              Số phút đủ công
              <input
                defaultValue={editing?.requiredWorkMinutes ?? 480}
                max="1440"
                min="1"
                name="requiredWorkMinutes"
                required
                type="number"
              />
            </label>
            <button className="primary-button form-action span-2 btn-tactile" disabled={saving}>
              {editing ? 'Lưu thay đổi lịch' : 'Tạo lịch làm việc'}
            </button>
            {editing && (
              <button
                className="table-action span-2"
                disabled={saving}
                onClick={() => setEditing(null)}
                type="button"
              >
                Hủy chỉnh sửa
              </button>
            )}
          </form>
        </details>

        <details className="cfg-panel" open>
          <summary>
            <span className="summary-label">
              <Plus aria-hidden="true" size={16} />
              Áp dụng theo phòng ban
            </span>
          </summary>
          <form className="form-grid compact" onSubmit={assignDepartment}>
            <label>
              Chi nhánh
              <select name="branchId" required>
                <option value="">Chọn chi nhánh</option>
                {branches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Phòng ban
              <select name="departmentId" required>
                <option value="">Chọn phòng ban</option>
                {departments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Lịch áp dụng
              <select name="scheduleId" required>
                <option value="">Chọn lịch</option>
                {items
                  ?.filter((row) => row.isActive)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.startTime.slice(0, 5)}–{row.endTime.slice(0, 5)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Hiệu lực từ
              <input defaultValue={today} name="effectiveFrom" required type="date" />
            </label>
            <label>
              Đến ngày (tùy chọn)
              <input name="effectiveTo" type="date" />
            </label>
            <button className="primary-button form-action span-2 btn-tactile" disabled={saving}>
              Áp dụng cho phòng ban
            </button>
          </form>
        </details>
      </div>

      {/* Ngoại lệ lịch cá nhân */}
      <details className="cfg-panel" style={{ marginBottom: 24 }}>
        <summary>
          <span className="summary-label">
            <Users aria-hidden="true" size={16} />
            Tạo ngoại lệ lịch cho một nhân viên
          </span>
        </summary>
        <form className="form-grid compact" onSubmit={assignEmployee}>
          <label>
            Nhân viên
            <select name="employeeId" required>
              <option value="">Chọn nhân viên</option>
              {employees.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.employeeCode} · {row.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lịch áp dụng
            <select name="scheduleId" required>
              <option value="">Chọn lịch</option>
              {items
                ?.filter((row) => row.isActive)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Hiệu lực từ
            <input defaultValue={today} name="effectiveFrom" required type="date" />
          </label>
          <label>
            Đến ngày (tùy chọn)
            <input name="effectiveTo" type="date" />
          </label>
          <button className="primary-button form-action span-2 btn-tactile" disabled={saving}>
            Tạo ngoại lệ cá nhân
          </button>
        </form>
      </details>

      {/* Danh sách các khung lịch làm việc */}
      {items === null ? (
        error ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError('');
              void load().catch(() => setError('Không thể tải cấu hình lịch làm việc.'));
            }}
          >
            Thử tải lại
          </button>
        ) : (
          <LoadingState />
        )
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có lịch làm việc"
          description="Tạo lịch chuẩn, sau đó áp dụng cho từng chi nhánh và phòng ban."
        />
      ) : (
        <div className="cfg-cards-grid">
          {items.map((item) => (
            <article className="cfg-card" key={item.id}>
              <div
                className={`cfg-card-status-strip ${
                  item.isActive ? 'cfg-card-strip-active' : 'cfg-card-strip-inactive'
                }`}
              />
              <div className="cfg-card-main">
                <div className="cfg-card-title-row">
                  <h3 className="cfg-card-title">{item.name}</h3>
                  <span className="cfg-card-chip cfg-card-chip-purple tabular-nums">
                    <Clock size={12} />
                    {item.startTime.slice(0, 5)} – {item.endTime.slice(0, 5)}
                  </span>
                  <span className="cfg-card-chip cfg-card-chip-teal">
                    {item.weekdays.map((day) => dayNames[day]).join(', ')}
                  </span>
                </div>

                <div className="cfg-card-desc">
                  Đi muộn sau <strong className="tabular-nums">{item.lateToleranceMinutes}p</strong> ·
                  Dung sai về sớm <strong className="tabular-nums">{item.earlyLeaveToleranceMinutes}p</strong> ·
                  Đủ công <strong className="tabular-nums">{item.requiredWorkMinutes}p</strong>
                </div>

                {item.departmentAssignments.length > 0 && (
                  <div style={{ margin: '8px 0', display: 'grid', gap: 4 }}>
                    {item.departmentAssignments.map((row) => (
                      <p className="assignment-line" key={row.id} style={{ margin: 0, fontSize: '0.78rem' }}>
                        <CornerDownRight aria-hidden="true" size={14} color="var(--brand-primary)" />
                        <strong>{row.branchName}</strong> / {row.departmentName} · Từ {formatDate(row.effectiveFrom)}
                        {row.effectiveTo ? ` đến ${formatDate(row.effectiveTo)}` : ''}
                      </p>
                    ))}
                  </div>
                )}

                {item.employeeAssignments?.length > 0 && (
                  <details style={{ marginTop: 6, fontSize: '0.78rem' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--brand-primary)', fontWeight: 650 }}>
                      Ngoại lệ cá nhân ({item.employeeAssignments.length} nhân sự)
                    </summary>
                    <div style={{ marginTop: 6, display: 'grid', gap: 4, paddingLeft: 12 }}>
                      {item.employeeAssignments.map((row) => (
                        <p className="assignment-line" key={row.id} style={{ margin: 0 }}>
                          <CornerDownRight aria-hidden="true" size={13} color="var(--brand-accent)" />
                          <span className="emp-code-chip">{row.employeeCode}</span> · {row.fullName} · Từ{' '}
                          {formatDate(row.effectiveFrom)}
                          {row.effectiveTo ? ` đến ${formatDate(row.effectiveTo)}` : ''}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <div className="cfg-card-actions">
                <StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} />
                <div className="cfg-card-action-row">
                  <button
                    className="table-action btn-tactile"
                    disabled={saving}
                    onClick={() => setEditing(item)}
                    type="button"
                  >
                    <Pencil size={13} /> Sửa
                  </button>
                  <button
                    className="table-action btn-tactile"
                    disabled={saving}
                    onClick={() => void toggle(item)}
                    type="button"
                  >
                    {item.isActive ? 'Tạm ngưng' : 'Kích hoạt'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Lịch sử cấu hình Admin */}
      <details className="cfg-panel" style={{ marginTop: 24 }}>
        <summary>
          <span className="summary-label">
            <ShieldCheck aria-hidden="true" size={16} />
            Lịch sử cấu hình (Bảo mật kiểm toán Admin)
          </span>
        </summary>
        <div className="cfg-panel-body" style={{ padding: 18 }}>
          {history.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>Chưa có thao tác cấu hình.</p>
          ) : (
            <div className="cfg-cards-grid">
              {history.slice(0, 12).map((row) => (
                <article
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid var(--line-crisp)',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>{row.action}</strong>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>
                      {row.resourceType.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <small style={{ fontSize: '0.72rem', color: 'var(--muted-light)' }}>
                    {row.actorName} · {formatDate(row.createdAt)}
                  </small>
                </article>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

