'use client';

import {
  Archive,
  Check,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  Pagination,
  PageHeader,
  StatusBadge,
  ToastNotice,
} from '@/components/admin-ui';
import { apiRequest, getAdminSession } from '@/lib/auth-api';
import { useActionDialog } from '@/components/use-action-dialog';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';

interface Lookup {
  id: string;
  code: string;
  name: string;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  employeeType: string;
  phone?: string;
  hireDate?: string;
  isActive: boolean;
  employmentEndDate?: string;
  employmentStatusReason?: string;
  department?: Lookup;
  position?: Lookup;
  accountEmail?: string;
  accountRoles: string[];
  scopeBranchIds: string[];
  organizationAssignments: OrganizationAssignment[];
}

interface OrganizationAssignment {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  departmentId: string;
  departmentName: string;
  positionId?: string;
  positionName?: string;
  managerEmployeeId?: string;
  managerName?: string;
  isPrimary: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

interface AssignmentDraft {
  key: string;
  branchId: string;
  departmentId: string;
  positionId: string;
  managerEmployeeId: string;
  isPrimary: boolean;
}

interface EmployeeHistoryEvent {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

interface EmployeeHistory {
  events: EmployeeHistoryEvent[];
  organizationAssignments: OrganizationAssignment[];
}

interface PagedEmployees { items: Employee[]; page: number; pageSize: number; total: number; activeTotal: number; inactiveTotal: number; }
const employeePageSize = 25;

const employeeTypeLabels: Record<string, string> = {
  OFFICE: 'Văn phòng',
  TECHNICAL: 'Kỹ thuật / Hiện trường',
};

const historyActionLabels: Record<string, string> = {
  CREATED: 'Tạo hồ sơ',
  UPDATED: 'Cập nhật hồ sơ',
  DEACTIVATED: 'Ngừng làm việc',
  REACTIVATED: 'Khôi phục hoạt động',
};

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[] | null>(null);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [positions, setPositions] = useState<Lookup[]>([]);
  const [branches, setBranches] = useState<Lookup[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editAssignments, setEditAssignments] = useState<AssignmentDraft[]>([]);
  const [statusEmployee, setStatusEmployee] = useState<Employee | null>(null);
  const [historyState, setHistoryState] = useState<{
    employee: Employee;
    data: EmployeeHistory | null;
  } | null>(null);
  const [employeeDirty, setEmployeeDirty] = useState(false);
  const [createFormVersion, setCreateFormVersion] = useState(0);
  const { request: requestAction, dialog: actionDialog } = useActionDialog();
  const confirmDiscardEmployee = useUnsavedChanges(employeeDirty, requestAction);

  async function load(selectedPage = page, selectedSearch = search): Promise<void> {
    const params = new URLSearchParams({ page: String(selectedPage), pageSize: String(employeePageSize) });
    if (selectedSearch.trim()) params.set('search', selectedSearch.trim());
    const [employees, people, deps, pos, branchItems] = await Promise.all([
      apiRequest<PagedEmployees>(`/employees?${params}`),
      apiRequest<Employee[]>('/employees'),
      apiRequest<Lookup[]>('/employees/lookups/departments'),
      apiRequest<Lookup[]>('/employees/lookups/positions'),
      apiRequest<Lookup[]>('/employees/lookups/branches'),
    ]);
    setItems(employees.items);
    setEmployeeOptions(people);
    setTotal(employees.total);
    setActiveTotal(employees.activeTotal);
    setPage(employees.page);
    setDepartments(deps);
    setPositions(pos);
    setBranches(branchItems);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<PagedEmployees>(`/employees?page=1&pageSize=${employeePageSize}`),
      apiRequest<Employee[]>('/employees'),
      apiRequest<Lookup[]>('/employees/lookups/departments'),
      apiRequest<Lookup[]>('/employees/lookups/positions'),
      apiRequest<Lookup[]>('/employees/lookups/branches'),
      getAdminSession(),
    ])
      .then(([employees, people, deps, pos, branchItems, session]) => {
        setItems(employees.items);
        setEmployeeOptions(people);
        setTotal(employees.total);
        setActiveTotal(employees.activeTotal);
        setDepartments(deps);
        setPositions(pos);
        setBranches(branchItems);
        setCanManage(session.roles.includes('ADMIN'));
      })
      .catch(() => setError('Không thể tải danh sách nhân viên.'));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '');
    const primaryDepartmentId = value('primaryDepartmentId');
    const departmentIds = [
      primaryDepartmentId,
      ...data.getAll('additionalDepartmentIds').map(String),
    ].filter((id, index, all) => id && all.indexOf(id) === index);
    const branchId = value('branchId');
    const positionId = value('positionId') || undefined;
    const managerEmployeeId = value('managerEmployeeId') || undefined;
    try {
      await apiRequest('/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: value('employeeCode'),
          fullName: value('fullName'),
          employeeType: value('employeeType'),
          phone: value('phone') || undefined,
          hireDate: value('hireDate') || undefined,
          organizationAssignments: departmentIds.map((departmentId) => ({
            branchId,
            departmentId,
            positionId,
            managerEmployeeId,
            isPrimary: departmentId === primaryDepartmentId,
          })),
          email: value('email') || undefined,
          temporaryPassword: value('temporaryPassword') || undefined,
          role: value('role') || undefined,
          scopeBranchIds: data.getAll('scopeBranchIds').map(String),
        }),
      });
      event.currentTarget.reset();
      setEmployeeDirty(false);
      setMessage('Đã tạo hồ sơ nhân viên thành công.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể tạo nhân viên.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function beginEdit(employee: Employee): Promise<void> {
    if (!(await confirmDiscardEmployee())) return;
    setEmployeeDirty(false);
    setCreateFormVersion((current) => current + 1);
    setEditing(employee);
    setStatusEmployee(null);
    setHistoryState(null);
    setEditAssignments(
      employee.organizationAssignments.map((assignment) => ({
        key: assignment.id,
        branchId: assignment.branchId,
        departmentId: assignment.departmentId,
        positionId: assignment.positionId ?? '',
        managerEmployeeId: assignment.managerEmployeeId ?? '',
        isPrimary: assignment.isPrimary,
      })),
    );
    setTimeout(() => document.getElementById('employee-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function updateEditAssignment(
    index: number,
    field: 'branchId' | 'departmentId' | 'positionId' | 'managerEmployeeId',
    value: string,
  ): void {
    setEditAssignments((current) =>
      current.map((assignment, assignmentIndex) =>
        assignmentIndex === index ? { ...assignment, [field]: value } : assignment,
      ),
    );
  }

  function makePrimary(index: number): void {
    setEditAssignments((current) =>
      current.map((assignment, assignmentIndex) => ({
        ...assignment,
        isPrimary: assignmentIndex === index,
      })),
    );
  }

  function addEditAssignment(): void {
    setEmployeeDirty(true);
    setEditAssignments((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        branchId: '',
        departmentId: '',
        positionId: '',
        managerEmployeeId: '',
        isPrimary: current.length === 0,
      },
    ]);
  }

  function removeEditAssignment(index: number): void {
    setEmployeeDirty(true);
    setEditAssignments((current) => {
      if (current.length === 1) return current;
      const next = current.filter((_, assignmentIndex) => assignmentIndex !== index);
      if (!next.some((assignment) => assignment.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? '');
    try {
      await apiRequest(`/employees/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: value('fullName'),
          employeeType: value('employeeType'),
          phone: value('phone') || null,
          hireDate: value('hireDate') || null,
          organizationAssignments: editAssignments.map((assignment) => ({
            branchId: assignment.branchId,
            departmentId: assignment.departmentId,
            positionId: assignment.positionId || undefined,
            managerEmployeeId: assignment.managerEmployeeId || undefined,
            isPrimary: assignment.isPrimary,
          })),
          scopeBranchIds: data.getAll('scopeBranchIds').map(String),
        }),
      });
      setEditing(null);
      setEmployeeDirty(false);
      setMessage(`Đã cập nhật hồ sơ ${editing.fullName}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật nhân viên.');
    } finally {
      setSaving(false);
    }
  }

  async function submitStatus(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!statusEmployee) return;
    setSaving(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const nextIsActive = !statusEmployee.isActive;
    try {
      await apiRequest(`/employees/${statusEmployee.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: nextIsActive,
          effectiveDate: data.get('effectiveDate'),
          reason: data.get('reason'),
        }),
      });
      setMessage(
        nextIsActive
          ? `Đã khôi phục hồ sơ ${statusEmployee.fullName}. Nhân viên cần đăng nhập lại trên thiết bị.`
          : `Đã ghi nhận ${statusEmployee.fullName} ngừng làm việc và thu hồi các phiên đăng nhập.`,
      );
      setStatusEmployee(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể thay đổi trạng thái nhân viên.');
    } finally {
      setSaving(false);
    }
  }

  async function viewHistory(employee: Employee): Promise<void> {
    if (!(await confirmDiscardEmployee())) return;
    setEditing(null);
    setEmployeeDirty(false);
    setCreateFormVersion((current) => current + 1);
    setStatusEmployee(null);
    setHistoryState({ employee, data: null });
    setError('');
    try {
      const data = await apiRequest<EmployeeHistory>(`/employees/${employee.id}/history`);
      setHistoryState({ employee, data });
      setTimeout(() => document.getElementById('employee-history-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (caught) {
      setHistoryState(null);
      setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử nhân viên.');
    }
  }

  async function beginStatusChange(employee: Employee): Promise<void> {
    if (!(await confirmDiscardEmployee())) return;
    setEmployeeDirty(false);
    setCreateFormVersion((current) => current + 1);
    setEditing(null);
    setHistoryState(null);
    setStatusEmployee(employee);
    setTimeout(() => document.getElementById('employee-status-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function createLookup(
    event: FormEvent<HTMLFormElement>,
    kind: 'departments' | 'positions' | 'branches',
  ): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(`/employees/lookups/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
        }),
      });
      event.currentTarget.reset();
      setMessage(
        kind === 'departments'
          ? 'Đã thêm phòng ban mới.'
          : kind === 'positions'
            ? 'Đã thêm chức vụ mới.'
            : 'Đã thêm chi nhánh mới.',
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể lưu danh mục.',
      );
    }
  }

  const activeEmployees = activeTotal;

  return (
    <div className="module-page">
      {actionDialog}
      <PageHeader
        description="Quản lý thông tin hồ sơ nhân viên, phòng ban, chức vụ và tài khoản đăng nhập."
        eyebrow="DANH MỤC NHÂN SỰ"
        title="Quản lý nhân viên"
      />

      {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
      {error && <Notice kind="error">{error}</Notice>}

      {/* Overview stats (Học hỏi từ Ảnh 6) */}
      <section
        aria-label="Thống kê nhân sự"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        <article className="metric-card">
          <p>Tổng số nhân sự</p>
          <strong>{total}</strong>
          <span>Hồ sơ đã tạo</span>
        </article>
        <article className="metric-card">
          <div className="metric-card-top">
            <p>Đang hoạt động</p>
            <Check
              aria-hidden="true"
              className="metric-card-icon success-icon"
              size={20}
              strokeWidth={2.1}
            />
          </div>
          <strong style={{ color: 'var(--emerald-dark)' }}>
            {activeEmployees}
          </strong>
          <span>Được phép chấm công</span>
        </article>
        <article className="metric-card">
          <p>Phòng ban</p>
          <strong>{departments.length}</strong>
          <span>Đơn vị tổ chức</span>
        </article>
        <article className="metric-card">
          <p>Chức vụ / Vị trí</p>
          <strong>{positions.length}</strong>
          <span>Vị trí chuyên môn</span>
        </article>
        <article className="metric-card">
          <p>Chi nhánh</p>
          <strong>{branches.length}</strong>
          <span>Phạm vi vận hành</span>
        </article>
      </section>

      {canManage && editing && (
        <section className="editor-panel employee-detail-panel" id="employee-edit-panel">
          <div className="panel-heading">
            <div>
              <span className="mono">{editing.employeeCode}</span>
              <h2>Sửa hồ sơ {editing.fullName}</h2>
              <p>Mã nhân viên và tài khoản đăng nhập được giữ nguyên để bảo toàn lịch sử.</p>
            </div>
            <button aria-label="Đóng biểu mẫu sửa" className="icon-button" onClick={() => void confirmDiscardEmployee().then((confirmed) => { if (confirmed) { setEditing(null); setEmployeeDirty(false); } })} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <form className="form-grid" key={editing.id} onChangeCapture={() => setEmployeeDirty(true)} onSubmit={submitEdit}>
            <label>
              Họ và tên
              <input defaultValue={editing.fullName} name="fullName" required />
            </label>
            <label>
              Loại nhân viên
              <select defaultValue={editing.employeeType} name="employeeType">
                <option value="OFFICE">Văn phòng (Office)</option>
                <option value="TECHNICAL">Kỹ thuật / Hiện trường</option>
              </select>
            </label>
            <label>
              Số điện thoại
              <input defaultValue={editing.phone ?? ''} name="phone" />
            </label>
            <label>
              Ngày vào làm
              <input defaultValue={editing.hireDate?.slice(0, 10) ?? ''} name="hireDate" type="date" />
            </label>
            <label>
              Tài khoản đăng nhập
              <input disabled value={editing.accountEmail ?? 'Chưa có tài khoản'} />
            </label>
            <label>
              Vai trò hiện tại
              <input disabled value={editing.accountRoles.join(', ') || 'Không có'} />
            </label>

            <fieldset className="assignment-editor span-2">
              <legend>Phân công tổ chức đang hiệu lực</legend>
              <div className="assignment-editor-list">
                {editAssignments.map((assignment, index) => (
                  <div className="assignment-editor-row" key={assignment.key}>
                    <label>
                      Chi nhánh
                      <select
                        onChange={(event) => updateEditAssignment(index, 'branchId', event.target.value)}
                        required
                        value={assignment.branchId}
                      >
                        <option value="">Chọn chi nhánh</option>
                        {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Phòng ban
                      <select
                        onChange={(event) => updateEditAssignment(index, 'departmentId', event.target.value)}
                        required
                        value={assignment.departmentId}
                      >
                        <option value="">Chọn phòng ban</option>
                        {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Chức vụ
                      <select
                        onChange={(event) => updateEditAssignment(index, 'positionId', event.target.value)}
                        value={assignment.positionId}
                      >
                        <option value="">Chưa phân chức vụ</option>
                        {positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Quản lý trực tiếp
                      <select
                        onChange={(event) => updateEditAssignment(index, 'managerEmployeeId', event.target.value)}
                        value={assignment.managerEmployeeId}
                      >
                        <option value="">Chưa chỉ định</option>
                        {employeeOptions.filter((item) => item.isActive && item.id !== editing.id).map((item) => (
                          <option key={item.id} value={item.id}>{item.fullName} · {item.employeeCode}</option>
                        ))}
                      </select>
                    </label>
                    <label className="check-inline primary-assignment-check">
                      <input
                        checked={assignment.isPrimary}
                        name="primaryAssignment"
                        onChange={() => makePrimary(index)}
                        type="radio"
                      />
                      Phân công chính
                    </label>
                    <button
                      aria-label="Xóa phân công"
                      className="icon-button danger-action"
                      disabled={editAssignments.length === 1}
                      onClick={() => removeEditAssignment(index)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="secondary-button compact-button" onClick={addEditAssignment} type="button">
                <Plus aria-hidden="true" size={16} /> Thêm phân công
              </button>
            </fieldset>

            <label className="span-2">
              Phạm vi chi nhánh quản lý
              <select defaultValue={editing.scopeBranchIds} multiple name="scopeBranchIds" size={Math.max(3, branches.length)}>
                {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <small>Chỉ áp dụng cho tài khoản có vai trò Quản lý khu vực.</small>
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" onClick={() => void confirmDiscardEmployee().then((confirmed) => { if (confirmed) { setEditing(null); setEmployeeDirty(false); } })} type="button">Hủy</button>
              <button className="primary-button" disabled={saving}>
                <Save aria-hidden="true" size={16} /> {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </section>
      )}

      {canManage && statusEmployee && (
        <section className="editor-panel employee-detail-panel" id="employee-status-panel">
          <div className="panel-heading">
            <div>
              <span className="mono">{statusEmployee.employeeCode}</span>
              <h2>{statusEmployee.isActive ? 'Ghi nhận ngừng làm việc' : 'Khôi phục hồ sơ nhân viên'}</h2>
              <p>
                {statusEmployee.isActive
                  ? 'Tài khoản, phiên đăng nhập và thiết bị push sẽ bị vô hiệu hóa ngay sau khi xác nhận.'
                  : 'Tài khoản được mở lại nhưng nhân viên phải đăng nhập lại trên thiết bị.'}
              </p>
            </div>
            <button aria-label="Đóng biểu mẫu trạng thái" className="icon-button" onClick={() => setStatusEmployee(null)} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <form className="form-grid compact" onSubmit={submitStatus}>
            <label>
              {statusEmployee.isActive ? 'Ngày ngừng làm việc' : 'Ngày khôi phục'}
              <input defaultValue={today()} max={today()} name="effectiveDate" required type="date" />
            </label>
            <label>
              Lý do
              <textarea
                minLength={5}
                name="reason"
                placeholder={statusEmployee.isActive ? 'VD: Kết thúc hợp đồng lao động' : 'VD: Khôi phục do thao tác nhầm'}
                required
              />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" onClick={() => setStatusEmployee(null)} type="button">Hủy</button>
              <button className={statusEmployee.isActive ? 'danger-button' : 'primary-button'} disabled={saving}>
                {statusEmployee.isActive ? <Archive aria-hidden="true" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
                {saving ? 'Đang xử lý…' : statusEmployee.isActive ? 'Xác nhận ngừng làm việc' : 'Khôi phục hồ sơ'}
              </button>
            </div>
          </form>
        </section>
      )}

      {historyState && (
        <section className="editor-panel employee-detail-panel" id="employee-history-panel">
          <div className="panel-heading">
            <div>
              <span className="mono">{historyState.employee.employeeCode}</span>
              <h2>Lịch sử {historyState.employee.fullName}</h2>
              <p>Thay đổi hồ sơ và các giai đoạn phân công tổ chức được giữ để đối soát.</p>
            </div>
            <button aria-label="Đóng lịch sử" className="icon-button" onClick={() => setHistoryState(null)} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {historyState.data === null ? <LoadingState /> : (
            <div className="employee-history-grid">
              <div>
                <h3>Nhật ký hồ sơ</h3>
                {historyState.data.events.length === 0 ? <p className="muted-copy">Chưa có thay đổi được ghi nhận.</p> : (
                  <div className="audit-list">
                    {historyState.data.events.map((event) => (
                      <div key={event.id}>
                        <strong>{historyActionLabels[event.action] ?? event.action}</strong>
                        <span>{event.actorName} · {new Date(event.createdAt).toLocaleString('vi-VN')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3>Lịch sử phân công</h3>
                <div className="audit-list">
                  {historyState.data.organizationAssignments.map((assignment) => (
                    <div key={assignment.id}>
                      <strong>{assignment.branchName} · {assignment.departmentName}{assignment.isPrimary ? ' · Chính' : ''}</strong>
                      <span>
                        {assignment.positionName ?? 'Chưa phân chức vụ'} · {assignment.effectiveFrom ?? '—'} → {assignment.effectiveTo ?? 'Hiện tại'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {canManage && !editing && <details className="editor-panel" open>
        <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Thêm hồ sơ nhân viên mới</span></summary>
        <form className="form-grid" key={createFormVersion} onChangeCapture={() => setEmployeeDirty(true)} onSubmit={submit}>
          <label>
            Mã nhân viên
            <input name="employeeCode" placeholder="VD: TM001" required />
          </label>
          <label>
            Họ và tên
            <input name="fullName" placeholder="Nguyễn Văn A" required />
          </label>
          <label>
            Loại nhân viên
            <select name="employeeType">
              <option value="OFFICE">Văn phòng (Office)</option>
              <option value="TECHNICAL">Kỹ thuật / Hiện trường</option>
            </select>
          </label>
          <label>
            Chi nhánh làm việc
            <select name="branchId" required>
              <option value="">Chọn chi nhánh</option>
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phòng ban chính
            <select name="primaryDepartmentId" required>
              <option value="">Chọn phòng ban chính</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phòng ban kiêm nhiệm
            <select multiple name="additionalDepartmentIds" size={4}>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <small>Giữ Ctrl để chọn nhiều phòng ban.</small>
          </label>
          <label>
            Chức vụ
            <select name="positionId">
              <option value="">Chưa phân chức vụ</option>
              {positions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quản lý trực tiếp
            <select name="managerEmployeeId">
              <option value="">Chưa chỉ định</option>
              {employeeOptions.filter((item) => item.isActive).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName} · {item.employeeCode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số điện thoại
            <input name="phone" placeholder="0901234567" />
          </label>
          <label>
            Ngày vào làm
            <input name="hireDate" type="date" />
          </label>
          <label>
            Email đăng nhập
            <input name="email" placeholder="nv@thienminh.vn" type="email" />
          </label>
          <label>
            Mật khẩu tạm
            <input
              minLength={12}
              name="temporaryPassword"
              placeholder="12+ ký tự, có hoa, thường, số và ký hiệu"
              type="password"
            />
          </label>
          <label>
            Vai trò hệ thống
            <select name="role">
              <option value="EMPLOYEE">Nhân viên (Xem công của mình)</option>
              <option value="AREA_MANAGER">Quản lý khu vực</option>
              <option value="CHIEF_ACCOUNTANT">Kế toán trưởng</option>
              <option value="MANAGER">Quản lý cũ (tương thích)</option>
              <option value="ADMIN">Admin (Toàn quyền quản trị)</option>
            </select>
          </label>
          <label>
            Phạm vi chi nhánh quản lý
            <select multiple name="scopeBranchIds" size={3}>
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <small>Áp dụng cho vai trò Quản lý khu vực.</small>
          </label>
          <button
            className="primary-button form-action span-2"
            disabled={saving}
          >
            {saving ? 'Đang lưu…' : 'Tạo hồ sơ nhân viên'}
          </button>
        </form>
      </details>}

      {canManage && <div className="split-editors">
        <details className="editor-panel">
          <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Thêm phòng ban mới</span></summary>
          <form
            className="inline-form"
            onSubmit={(event) => void createLookup(event, 'departments')}
          >
            <input name="code" placeholder="Mã phòng (VD: NHA_KHOA)" required />
            <input
              name="name"
              placeholder="Tên phòng ban (VD: Khối Điều Trị)"
              required
            />
            <button className="secondary-button">Thêm phòng ban</button>
          </form>
        </details>

        <details className="editor-panel">
          <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Thêm chức vụ mới</span></summary>
          <form
            className="inline-form"
            onSubmit={(event) => void createLookup(event, 'positions')}
          >
            <input name="code" placeholder="Mã chức vụ (VD: BAC_SI)" required />
            <input
              name="name"
              placeholder="Tên chức vụ (VD: Bác sĩ Trưởng ca)"
              required
            />
            <button className="secondary-button">Thêm chức vụ</button>
          </form>
        </details>

        <details className="editor-panel">
          <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Thêm chi nhánh mới</span></summary>
          <form
            className="inline-form"
            onSubmit={(event) => void createLookup(event, 'branches')}
          >
            <input name="code" placeholder="Mã chi nhánh (VD: DN)" required />
            <input
              name="name"
              placeholder="Tên chi nhánh"
              required
            />
            <button className="secondary-button">Thêm chi nhánh</button>
          </form>
        </details>
      </div>}

      <form className="toolbar" onSubmit={(event) => { event.preventDefault(); setItems(null); setError(''); void load(1, search).catch((caught) => { setError(caught instanceof Error ? caught.message : 'Không thể tìm nhân viên.'); setItems([]); }); }}>
        <label>Tìm nhân viên<input aria-label="Tìm theo mã hoặc họ tên" onChange={(event) => setSearch(event.target.value)} placeholder="Mã nhân viên hoặc họ tên…" value={search} /></label>
        <button className="secondary-button">Tìm kiếm</button>
        {search && <button className="table-action" onClick={() => { setSearch(''); setItems(null); setError(''); void load(1, '').catch((caught) => { setError(caught instanceof Error ? caught.message : 'Không thể xóa bộ lọc.'); setItems([]); }); }} type="button">Xóa bộ lọc</button>}
      </form>

      {items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          description={search ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem toàn bộ nhân viên.' : 'Tạo hồ sơ nhân viên đầu tiên bằng biểu mẫu phía trên.'}
          title={search ? 'Không tìm thấy nhân viên' : 'Chưa có nhân viên'}
        />
      ) : (
        <><div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã NV</th>
                <th>Họ và tên</th>
                <th>Loại nhân sự</th>
                <th>Chi nhánh</th>
                <th>Phòng ban</th>
                <th>Chức vụ</th>
                <th>Tài khoản</th>
                <th>Trạng thái</th>
                {canManage && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong style={{ color: 'var(--brand-primary)' }}>
                      {item.employeeCode}
                    </strong>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--ink)' }}>
                      {item.fullName}
                    </strong>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'var(--canvas-subtle)',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                      }}
                    >
                      {employeeTypeLabels[item.employeeType] ??
                        item.employeeType}
                    </span>
                  </td>
                  <td>
                    {[
                      ...new Set(
                        item.organizationAssignments.map(
                          (assignment) => assignment.branchName,
                        ),
                      ),
                    ].join(', ') || '—'}
                  </td>
                  <td>
                    {item.organizationAssignments
                      .map((assignment) =>
                        assignment.isPrimary
                          ? `${assignment.departmentName} (chính)`
                          : assignment.departmentName,
                      )
                      .join(', ') || item.department?.name || '—'}
                  </td>
                  <td>
                    {item.organizationAssignments.find(
                      (assignment) => assignment.isPrimary,
                    )?.positionName ?? item.position?.name ?? '—'}
                  </td>
                  <td>
                    <small style={{ color: 'var(--muted)' }}>
                      {item.accountEmail ?? '—'}
                    </small>
                  </td>
                  <td>
                    <StatusBadge value={item.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    {!item.isActive && (
                      <small className="employee-status-note">
                        {item.employmentEndDate ? `Từ ${item.employmentEndDate}` : ''}
                        {item.employmentStatusReason ? ` · ${item.employmentStatusReason}` : ''}
                      </small>
                    )}
                  </td>
                  {canManage && <td>
                    <div className="action-group employee-actions">
                      <button className="table-action" onClick={() => void beginEdit(item)} type="button">
                        <Pencil aria-hidden="true" size={14} /> Sửa
                      </button>
                      <button className="table-action" onClick={() => void viewHistory(item)} type="button">
                        <History aria-hidden="true" size={14} /> Lịch sử
                      </button>
                      <button
                        className={`table-action ${item.isActive ? 'danger-action' : 'success-action'}`}
                        onClick={() => void beginStatusChange(item)}
                        type="button"
                      >
                        {item.isActive ? <Archive aria-hidden="true" size={14} /> : <RotateCcw aria-hidden="true" size={14} />}
                        {item.isActive ? 'Ngừng làm việc' : 'Khôi phục'}
                      </button>
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div><Pagination page={page} pageSize={employeePageSize} total={total} onPageChange={(nextPage) => { setItems(null); setError(''); void load(nextPage).catch((caught) => { setError(caught instanceof Error ? caught.message : 'Không thể chuyển trang.'); setItems([]); }); }} /></>
      )}
    </div>
  );
}
