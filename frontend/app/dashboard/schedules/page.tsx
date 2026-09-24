'use client';

import { CornerDownRight, Pencil, Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState, LoadingState, Notice, PageHeader, StatusBadge, formatDate } from '@/components/admin-ui';
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
}
interface Lookup { id: string; code: string; name: string; }
interface Employee { id: string; employeeCode: string; fullName: string; }
interface AuditLog { id: string; resourceType: string; action: string; actorName: string; createdAt: string; }

const dayNames: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
const today = new Date().toLocaleDateString('en-CA');

export default function SchedulesPage() {
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [branches, setBranches] = useState<Lookup[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [schedules, people, departmentRows, branchRows, auditRows] = await Promise.all([
      apiRequest<Schedule[]>('/work-schedules'),
      apiRequest<Employee[]>('/employees'),
      apiRequest<Lookup[]>('/employees/lookups/departments'),
      apiRequest<Lookup[]>('/employees/lookups/branches'),
      apiRequest<AuditLog[]>('/work-schedules/history'),
    ]);
    setItems(schedules);
    setEmployees(people);
    setDepartments(departmentRows);
    setBranches(branchRows);
    setHistory(auditRows);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(() => setError('Không thể tải cấu hình lịch làm việc.')); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveSchedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
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
      setMessage(editing ? 'Đã cập nhật lịch làm việc.' : 'Đã tạo lịch làm việc.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu lịch làm việc.'); }
  }

  async function assignDepartment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      await apiRequest(`/work-schedules/${String(form.get('scheduleId'))}/department-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          branchId: form.get('branchId'), departmentId: form.get('departmentId'),
          effectiveFrom: form.get('effectiveFrom'), effectiveTo: form.get('effectiveTo') || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage('Đã áp dụng lịch cho phòng ban. Lịch cũ được lưu trong lịch sử.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể áp dụng lịch.'); }
  }

  async function assignEmployee(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      await apiRequest(`/work-schedules/${String(form.get('scheduleId'))}/employee-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.get('employeeId'), effectiveFrom: form.get('effectiveFrom'),
          effectiveTo: form.get('effectiveTo') || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage('Đã tạo ngoại lệ lịch cho nhân viên.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể gán lịch cá nhân.'); }
  }

  async function toggle(item: Schedule): Promise<void> {
    await apiRequest(`/work-schedules/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) });
    setMessage(item.isActive ? 'Đã tạm ngưng lịch.' : 'Đã kích hoạt lịch.');
    await load();
  }

  const activeCount = items?.filter((item) => item.isActive).length ?? 0;
  return (
    <div className="module-page">
      <PageHeader eyebrow="CẤU HÌNH CA & LỊCH" title="Lịch làm việc" description="Admin cấu hình lịch theo chi nhánh và phòng ban; ngoại lệ cá nhân được ưu tiên khi tính công." />
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <section aria-label="Tóm tắt lịch" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 24 }}>
        <article className="metric-card"><p>Tổng lịch</p><strong>{items?.length ?? 0}</strong><span>Cấu hình trong hệ thống</span></article>
        <article className="metric-card"><p>Đang hoạt động</p><strong>{activeCount}</strong><span>Sẵn sàng áp dụng</span></article>
        <article className="metric-card"><p>Chuẩn đủ công</p><strong>8 giờ</strong><span>Mặc định 480 phút</span></article>
      </section>

      <div className="split-editors">
        <details className="editor-panel" open>
          <summary><span className="summary-label">{editing ? <Pencil aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}{editing ? `Chỉnh sửa · ${editing.name}` : 'Tạo khung lịch mới'}</span></summary>
          <form className="form-grid compact" key={editing?.id ?? 'new'} onSubmit={saveSchedule}>
            <label className="span-2">Tên lịch<input defaultValue={editing?.name ?? ''} name="name" placeholder="VD: Ca hành chính" required /></label>
            <fieldset className="span-2 weekday-field"><legend>Ngày làm việc</legend>
              {Object.entries(dayNames).map(([value, label]) => <label key={value}><input defaultChecked={editing ? editing.weekdays.includes(Number(value)) : Number(value) <= 5} name="weekdays" type="checkbox" value={value} />{label}</label>)}
            </fieldset>
            <label>Giờ bắt đầu<input defaultValue={editing?.startTime.slice(0, 5) ?? '08:00'} name="startTime" required type="time" /></label>
            <label>Giờ kết thúc<input defaultValue={editing?.endTime.slice(0, 5) ?? '17:00'} name="endTime" required type="time" /></label>
            <label>Dung sai đi muộn (phút)<input defaultValue={editing?.lateToleranceMinutes ?? 3} min="0" max="180" name="lateToleranceMinutes" required type="number" /></label>
            <label>Dung sai về sớm (phút)<input defaultValue={editing?.earlyLeaveToleranceMinutes ?? 0} min="0" max="180" name="earlyLeaveToleranceMinutes" required type="number" /></label>
            <label className="span-2">Số phút đủ công<input defaultValue={editing?.requiredWorkMinutes ?? 480} min="1" max="1440" name="requiredWorkMinutes" required type="number" /></label>
            <button className="primary-button form-action span-2">{editing ? 'Lưu thay đổi' : 'Tạo lịch làm việc'}</button>
            {editing && <button className="table-action span-2" onClick={() => setEditing(null)} type="button">Hủy chỉnh sửa</button>}
          </form>
        </details>

        <details className="editor-panel" open>
          <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Áp dụng theo phòng ban</span></summary>
          <form className="form-grid compact" onSubmit={assignDepartment}>
            <label>Chi nhánh<select name="branchId" required><option value="">Chọn chi nhánh</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label>Phòng ban<select name="departmentId" required><option value="">Chọn phòng ban</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="span-2">Lịch áp dụng<select name="scheduleId" required><option value="">Chọn lịch</option>{items?.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.startTime.slice(0, 5)}–{row.endTime.slice(0, 5)}</option>)}</select></label>
            <label>Hiệu lực từ<input defaultValue={today} name="effectiveFrom" required type="date" /></label>
            <label>Đến ngày (tùy chọn)<input name="effectiveTo" type="date" /></label>
            <button className="primary-button form-action span-2">Áp dụng cho phòng ban</button>
          </form>
        </details>
      </div>

      <details className="editor-panel" style={{ marginBottom: 24 }}>
        <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Tạo ngoại lệ lịch cho một nhân viên</span></summary>
        <form className="form-grid compact" onSubmit={assignEmployee}>
          <label>Nhân viên<select name="employeeId" required><option value="">Chọn nhân viên</option>{employees.map((row) => <option key={row.id} value={row.id}>{row.employeeCode} · {row.fullName}</option>)}</select></label>
          <label>Lịch áp dụng<select name="scheduleId" required><option value="">Chọn lịch</option>{items?.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Hiệu lực từ<input defaultValue={today} name="effectiveFrom" required type="date" /></label>
          <label>Đến ngày (tùy chọn)<input name="effectiveTo" type="date" /></label>
          <button className="primary-button form-action span-2">Tạo ngoại lệ cá nhân</button>
        </form>
      </details>

      {items === null ? <LoadingState /> : items.length === 0 ? <EmptyState title="Chưa có lịch làm việc" description="Tạo lịch chuẩn, sau đó áp dụng cho từng chi nhánh và phòng ban." /> : (
        <div className="card-list">{items.map((item) => <article className="list-card" key={item.id}>
          <div><h3>{item.name}</h3><p><strong>{item.weekdays.map((day) => dayNames[day]).join(', ')}</strong> · {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</p>
            <small>Đi muộn sau {item.lateToleranceMinutes} phút · Đủ công {item.requiredWorkMinutes} phút · Ngoại lệ cá nhân: {item.employeeAssignmentCount}</small>
            {item.departmentAssignments.map((row) => <p className="assignment-line" key={row.id} style={{ margin: '6px 0 0' }}><CornerDownRight aria-hidden="true" size={15} />{row.branchName} / {row.departmentName} · từ {formatDate(row.effectiveFrom)}{row.effectiveTo ? ` đến ${formatDate(row.effectiveTo)}` : ''}</p>)}
          </div>
          <div><StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} /><button className="table-action" onClick={() => setEditing(item)} type="button">Sửa</button><button className="table-action" onClick={() => void toggle(item)} type="button">{item.isActive ? 'Tạm ngưng' : 'Kích hoạt'}</button></div>
        </article>)}</div>
      )}

      <details className="editor-panel" style={{ marginTop: 24 }}><summary>Lịch sử cấu hình (chỉ Admin)</summary>
        {history.length === 0 ? <p>Chưa có thao tác cấu hình.</p> : <div className="card-list">{history.slice(0, 12).map((row) => <article className="list-card" key={row.id}><div><h3>{row.action}</h3><p>{row.resourceType.replaceAll('_', ' ')}</p></div><small>{row.actorName} · {formatDate(row.createdAt)}</small></article>)}</div>}
      </details>
    </div>
  );
}
