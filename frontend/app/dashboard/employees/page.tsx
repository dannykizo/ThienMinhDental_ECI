'use client';

import { Check, Plus } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@/components/admin-ui';
import { apiRequest, getAdminSession } from '@/lib/auth-api';

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
}

const employeeTypeLabels: Record<string, string> = {
  OFFICE: 'Văn phòng',
  TECHNICAL: 'Kỹ thuật / Hiện trường',
};

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[] | null>(null);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [positions, setPositions] = useState<Lookup[]>([]);
  const [branches, setBranches] = useState<Lookup[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    const [employees, deps, pos, branchItems] = await Promise.all([
      apiRequest<Employee[]>('/employees'),
      apiRequest<Lookup[]>('/employees/lookups/departments'),
      apiRequest<Lookup[]>('/employees/lookups/positions'),
      apiRequest<Lookup[]>('/employees/lookups/branches'),
    ]);
    setItems(employees);
    setDepartments(deps);
    setPositions(pos);
    setBranches(branchItems);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<Employee[]>('/employees'),
      apiRequest<Lookup[]>('/employees/lookups/departments'),
      apiRequest<Lookup[]>('/employees/lookups/positions'),
      apiRequest<Lookup[]>('/employees/lookups/branches'),
      getAdminSession(),
    ])
      .then(([employees, deps, pos, branchItems, session]) => {
        setItems(employees);
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

  async function toggle(employee: Employee): Promise<void> {
    setError('');
    await apiRequest(`/employees/${employee.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !employee.isActive }),
    })
      .then(load)
      .catch((caught: Error) => setError(caught.message));
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

  const activeEmployees = items?.filter((e) => e.isActive).length ?? 0;

  return (
    <div className="module-page">
      <PageHeader
        description="Quản lý thông tin hồ sơ nhân viên, phòng ban, chức vụ và tài khoản đăng nhập."
        eyebrow="DANH MỤC NHÂN SỰ"
        title="Quản lý nhân viên"
      />

      {message && <Notice kind="success">{message}</Notice>}
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
          <strong>{items?.length ?? 0}</strong>
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

      {canManage && <details className="editor-panel" open>
        <summary><span className="summary-label"><Plus aria-hidden="true" size={16} />Thêm hồ sơ nhân viên mới</span></summary>
        <form className="form-grid" onSubmit={submit}>
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
              {items?.filter((item) => item.isActive).map((item) => (
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
              minLength={8}
              name="temporaryPassword"
              placeholder="Tối thiểu 8 ký tự"
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

      {items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          description="Tạo hồ sơ nhân viên đầu tiên bằng biểu mẫu phía trên."
          title="Chưa có nhân viên"
        />
      ) : (
        <div className="table-wrap">
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
                  </td>
                  {canManage && <td>
                    <button
                      className="table-action"
                      onClick={() => void toggle(item)}
                      type="button"
                    >
                      {item.isActive ? 'Tạm khóa' : 'Mở khóa'}
                    </button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
