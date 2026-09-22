'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface Schedule {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  lateToleranceMinutes: number;
  isActive: boolean;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
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

export default function SchedulesPage() {
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    const [schedules, people] = await Promise.all([
      apiRequest<Schedule[]>('/work-schedules'),
      apiRequest<Employee[]>('/employees'),
    ]);
    setItems(schedules);
    setEmployees(people);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<Schedule[]>('/work-schedules'),
      apiRequest<Employee[]>('/employees'),
    ])
      .then(([schedules, people]) => {
        setItems(schedules);
        setEmployees(people);
      })
      .catch(() => setError('Không thể tải cấu hình lịch làm việc.'));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weekdays = form.getAll('weekdays').map(Number);
    try {
      await apiRequest('/work-schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          weekdays,
          startTime: form.get('startTime'),
          endTime: form.get('endTime'),
          lateToleranceMinutes: Number(form.get('lateToleranceMinutes')),
        }),
      });
      event.currentTarget.reset();
      setMessage('Đã tạo cấu hình lịch làm việc.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu lịch.');
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(
        `/work-schedules/${String(form.get('scheduleId'))}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify({
            employeeId: form.get('employeeId'),
            effectiveFrom: form.get('effectiveFrom'),
            effectiveTo: form.get('effectiveTo') || undefined,
          }),
        },
      );
      event.currentTarget.reset();
      setMessage('Đã phân lịch thành công cho nhân viên.');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể phân lịch.',
      );
    }
  }

  const activeCount = items?.filter((s) => s.isActive).length ?? 0;

  return (
    <div className="module-page">
      <PageHeader
        description="Thiết lập ngày làm việc, khung giờ chuẩn và dung sai đi muộn cho chi nhánh."
        eyebrow="CẤU HÌNH CA & LỊCH"
        title="Lịch làm việc"
      />

      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {/* Summary KPI (Học hỏi từ Ảnh 8) */}
      <section
        aria-label="Tóm tắt lịch"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        <article className="metric-card">
          <p>Tổng số ca / lịch</p>
          <strong>{items?.length ?? 0}</strong>
          <span>Cấu hình trong hệ thống</span>
        </article>
        <article className="metric-card">
          <div className="metric-card-top">
            <p>Lịch đang áp dụng</p>
            <span style={{ color: 'var(--emerald)' }}>✓</span>
          </div>
          <strong style={{ color: 'var(--emerald-dark)' }}>{activeCount}</strong>
          <span>Đang gán cho nhân viên</span>
        </article>
        <article className="metric-card">
          <p>Nhân viên đã có hồ sơ</p>
          <strong>{employees.length}</strong>
          <span>Sẵn sàng phân ca</span>
        </article>
      </section>

      <div className="split-editors">
        <details className="editor-panel" open>
          <summary>+ Tạo khung lịch làm việc mới</summary>
          <form className="form-grid compact" onSubmit={create}>
            <label className="span-2">
              Tên khung lịch
              <input
                name="name"
                placeholder="VD: Ca hành chính phòng khám"
                required
              />
            </label>

            <fieldset className="span-2 weekday-field">
              <legend>Các ngày làm việc trong tuần</legend>
              {Object.entries(dayNames).map(([value, label]) => (
                <label key={value}>
                  <input
                    defaultChecked={Number(value) <= 5}
                    name="weekdays"
                    type="checkbox"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <label>
              Giờ bắt đầu
              <input defaultValue="08:00" name="startTime" required type="time" />
            </label>
            <label>
              Giờ kết thúc
              <input defaultValue="17:00" name="endTime" required type="time" />
            </label>
            <label className="span-2">
              Dung sai đi muộn (phút)
              <input
                defaultValue="5"
                min="0"
                name="lateToleranceMinutes"
                required
                type="number"
              />
            </label>
            <button className="primary-button form-action span-2">
              Lưu lịch làm việc
            </button>
          </form>
        </details>

        <details className="editor-panel" open>
          <summary>+ Phân lịch cho nhân sự</summary>
          <form className="form-grid compact" onSubmit={assign}>
            <label className="span-2">
              Nhân viên
              <select name="employeeId" required>
                <option value="">Chọn nhân viên</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} · {e.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="span-2">
              Khung lịch áp dụng
              <select name="scheduleId" required>
                <option value="">Chọn khung lịch</option>
                {items
                  ?.filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)})
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Hiệu lực từ ngày
              <input name="effectiveFrom" required type="date" />
            </label>
            <label>
              Đến ngày (tùy chọn)
              <input name="effectiveTo" type="date" />
            </label>

            <button className="primary-button form-action span-2">
              Gán lịch làm việc
            </button>
          </form>
        </details>
      </div>

      {items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          description="Tạo lịch làm việc chuẩn để bắt đầu đối soát attendance."
          title="Chưa có lịch làm việc"
        />
      ) : (
        <div className="card-list">
          {items.map((item) => (
            <article className="list-card" key={item.id}>
              <div>
                <h3>{item.name}</h3>
                <p>
                  <strong>Ngày làm:</strong>{' '}
                  {item.weekdays.map((day) => dayNames[day]).join(', ')} ·{' '}
                  <strong>Khung giờ:</strong> {item.startTime.slice(0, 5)} –{' '}
                  {item.endTime.slice(0, 5)}
                </p>
                <small>Dung sai tính muộn: {item.lateToleranceMinutes} phút</small>
              </div>
              <div>
                <StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
