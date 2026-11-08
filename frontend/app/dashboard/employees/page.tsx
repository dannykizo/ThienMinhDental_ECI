'use client';

import {
  Archive,
  Briefcase,
  Building2,
  Check,
  Copy,
  History,
  KeyRound,
  MapPin,
  MoreHorizontal,
  Network,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { WorkflowDrawer } from '@/components/workflow-ui';
import { EmployeeProfileOverlay, type EmployeeProfileAction } from '@/components/employee-profile-overlay';
import './employee-profile.css';

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
  employeeType: string;
  phone?: string;
  hireDate?: string;
  isActive: boolean;
  employmentEndDate?: string;
  employmentStatusReason?: string;
  department?: Lookup;
  position?: Lookup;
  accountEmail?: string;
  hasAccount?: boolean;
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
interface AccountView { employeeId: string; employeeCode: string; fullName: string; account: { username: string; isActive: boolean } | null }
interface DeletionImpact { employeeId: string; employeeCode: string; fullName: string; counts: Record<string, number>; confirmationToken: string; hasAccount: boolean; isCurrentAccount: boolean }
const deletionLabels: Record<string, string> = {
  employee_portraits: 'Ảnh chân dung hồ sơ',
  attendance_events: 'Sự kiện chấm công', attendance_adjustments: 'Điều chỉnh công',
  attendance_explanation_requests: 'Đơn giải trình', attendance_explanation_routes: 'Tuyến giải trình riêng',
  leave_requests: 'Đơn nghỉ phép', leave_approval_routes: 'Tuyến phép riêng', employee_leave_balances: 'Quỹ phép (kèm điều chỉnh)',
  employee_disciplinary_actions: 'Quyết định kỷ luật', organization_team_memberships: 'Thành viên team',
  employee_schedules: 'Lịch cá nhân', employee_organization_assignments: 'Phân công tổ chức',
  business_trip_members: 'Phần tham gia công tác', announcement_recipients: 'Trạng thái nhận thông báo',
  announcements: 'Thông báo cá nhân', push_device_tokens: 'Thiết bị push', attendance_evidence_uploads: 'Ảnh đã tải lên',
  auth_sessions: 'Phiên đăng nhập', user_roles: 'Vai trò tài khoản', user_branch_scopes: 'Phạm vi chi nhánh',
  users: 'Tài khoản được vô hiệu hóa và ẩn danh',
  organization_management_grants: 'Quyền quản lý bị thu hồi', business_trips: 'Phiếu chung bỏ người phụ trách',
  manager_assignments: 'Phân công khác bỏ quản lý trực tiếp', explanation_reviewer_routes: 'Tuyến giải trình khác mất người duyệt',
  leave_reviewer_routes: 'Tuyến phép khác mất người duyệt',
};
const employeePageSize = 10;

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

type QuickFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'OFFICE' | 'TECHNICAL';

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

function EmployeePanel({ title, subtitle, error, busy, onClose, children }: { title: string; subtitle: string; error: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  return <WorkflowDrawer title={title} subtitle={subtitle} eyebrow="QUẢN LÝ NHÂN SỰ" className="employee-drawer" busy={busy} onClose={onClose}>
    {error && <Notice kind="error">{error}</Notice>}{children}
  </WorkflowDrawer>;
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
  const [appliedSearch, setAppliedSearch] = useState('');
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [profileRevision, setProfileRevision] = useState(0);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [actionEmployee, setActionEmployee] = useState<Employee | null>(null);
  const [editAssignments, setEditAssignments] = useState<AssignmentDraft[]>([]);
  const [statusEmployee, setStatusEmployee] = useState<Employee | null>(null);
  const [historyState, setHistoryState] = useState<{
    employee: Employee;
    data: EmployeeHistory | null;
  } | null>(null);
  const [employeeDirty, setEmployeeDirty] = useState(false);
  const [createFormVersion, setCreateFormVersion] = useState(0);
  const [accountView, setAccountView] = useState<AccountView | null>(null);
  const [deletion, setDeletion] = useState<DeletionImpact | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const adminBusyRef = useRef(false);
  const { request: requestAction, dialog: actionDialog } = useActionDialog();
  const confirmDiscardEmployee = useUnsavedChanges(employeeDirty, requestAction);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  function copyInline(text: string, key: string, event: React.MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    if (!text || !navigator.clipboard?.writeText) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1500);
    });
  }

  const filteredItems = useMemo(() => {
    if (!items) return null;
    return items.filter((item) => {
      if (quickFilter === 'ACTIVE') return item.isActive;
      if (quickFilter === 'INACTIVE') return !item.isActive;
      if (quickFilter === 'OFFICE') return item.employeeType === 'OFFICE';
      if (quickFilter === 'TECHNICAL') return item.employeeType === 'TECHNICAL';
      return true;
    });
  }, [items, quickFilter]);

  async function closePanel(): Promise<void> {
    if (saving || adminBusyRef.current || !(await confirmDiscardEmployee())) return;
    setEditing(null); setAccountView(null); setDeletion(null); setHistoryState(null); setStatusEmployee(null);
    setCreateOpen(false); setLookupOpen(false); setActionEmployee(null); setEmployeeDirty(false);
  }

  async function openPanel(kind: 'create' | 'lookups' | 'actions', employee?: Employee): Promise<void> {
    if (saving || adminBusyRef.current || !(await confirmDiscardEmployee())) return;
    setEditing(null); setAccountView(null); setDeletion(null); setHistoryState(null); setStatusEmployee(null);
    setEmployeeDirty(false); setError(''); setCreateFormVersion(version => version + 1);
    setCreateOpen(kind === 'create'); setLookupOpen(kind === 'lookups'); setActionEmployee(kind === 'actions' ? employee ?? null : null);
  }

  async function openProfile(employee: Employee): Promise<void> {
    if (saving || adminBusyRef.current || !(await confirmDiscardEmployee())) return;
    setEditing(null); setAccountView(null); setDeletion(null); setHistoryState(null); setStatusEmployee(null);
    setCreateOpen(false); setLookupOpen(false); setActionEmployee(null); setEmployeeDirty(false); setError('');
    setProfileEmployee(employee);
  }

  function profileAction(action: EmployeeProfileAction, employeeId: string): void {
    const employee = employeeOptions.find(item => item.id === employeeId);
    if (!employee || saving || adminBusyRef.current) return;
    if (action === 'edit') void beginEdit(employee);
    else if (action === 'account') void openAdminAction(employee, 'account');
    else if (action === 'delete') void openAdminAction(employee, 'deletion-impact');
    else if (action === 'history') void viewHistory(employee);
    else void beginStatusChange(employee);
  }

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
    setAppliedSearch(selectedSearch.trim());
    setProfileRevision(value => value + 1);
    setEmployeeOptions(people);
    setTotal(employees.total);
    setActiveTotal(employees.activeTotal);
    setPage(employees.page);
    setDepartments(deps);
    setPositions(pos);
    setBranches(branchItems);
  }

  function changeEmployeePage(nextPage: number): void {
    setItems(null);
    setError('');
    void load(nextPage, appliedSearch).catch((caught) => {
      setError(caught instanceof Error ? caught.message : 'Không thể chuyển trang.');
      setItems([]);
    });
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
    const formElement = event.currentTarget;
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
      formElement.reset();
      setEmployeeDirty(false);
      setCreateOpen(false);
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
    if (adminBusyRef.current || saving) return;
    if (!(await confirmDiscardEmployee())) return;
    try { employee = await apiRequest<Employee>(`/employees/${employee.id}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể mở hồ sơ.'); return; }
    setEmployeeDirty(false);
    setCreateOpen(false); setLookupOpen(false); setActionEmployee(null);
    setCreateFormVersion((current) => current + 1);
    setEditing(employee);
    setAccountView(null); setDeletion(null);
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
    const assignments = editAssignments.map(assignment => ({ branchId: assignment.branchId,departmentId: assignment.departmentId,
      positionId: assignment.positionId || null,managerEmployeeId: assignment.managerEmployeeId || null,isPrimary: assignment.isPrimary }));
    const originalAssignments = editing.organizationAssignments.map(assignment => ({ branchId: assignment.branchId,departmentId: assignment.departmentId,
      positionId: assignment.positionId ?? null,managerEmployeeId: assignment.managerEmployeeId ?? null,isPrimary: assignment.isPrimary }));
    const assignmentKey = (rows: typeof assignments) => rows.map(row=>JSON.stringify(row)).sort().join('|');
    const assignmentsChanged = assignmentKey(assignments)!==assignmentKey(originalAssignments);
    const scopes = data.getAll('scopeBranchIds').map(String);
    const scopesChanged = [...scopes].sort().join('|')!==[...editing.scopeBranchIds].sort().join('|');
    try {
      await apiRequest(`/employees/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: value('fullName'),
          employeeType: value('employeeType'),
          phone: value('phone') || null,
          hireDate: value('hireDate') || null,
          organizationAssignments: assignmentsChanged ? editAssignments.map((assignment) => ({
            branchId: assignment.branchId,
            departmentId: assignment.departmentId,
            positionId: assignment.positionId || undefined,
            managerEmployeeId: assignment.managerEmployeeId || undefined,
            isPrimary: assignment.isPrimary,
          })) : undefined,
          scopeBranchIds: scopesChanged ? scopes : undefined,
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
    if (adminBusyRef.current || saving) return;
    if (!(await confirmDiscardEmployee())) return;
    setEditing(null);
    setEmployeeDirty(false);
    setCreateOpen(false); setLookupOpen(false); setActionEmployee(null);
    setCreateFormVersion((current) => current + 1);
    setStatusEmployee(null);
    setAccountView(null); setDeletion(null);
    setHistoryState({ employee, data: null });
    setError('');
    try {
      const data = await apiRequest<EmployeeHistory>(`/employees/${employee.id}/history`);
      setHistoryState(current => current?.employee.id === employee.id ? { employee, data } : current);
    } catch (caught) {
      setHistoryState(null);
      setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử nhân viên.');
    }
  }

  async function beginStatusChange(employee: Employee): Promise<void> {
    if (adminBusyRef.current || saving) return;
    if (!(await confirmDiscardEmployee())) return;
    setEmployeeDirty(false);
    setCreateOpen(false); setLookupOpen(false); setActionEmployee(null);
    setCreateFormVersion((current) => current + 1);
    setEditing(null);
    setAccountView(null); setDeletion(null);
    setHistoryState(null);
    setStatusEmployee(employee);
  }

  async function createLookup(
    event: FormEvent<HTMLFormElement>,
    kind: 'departments' | 'positions' | 'branches',
  ): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiRequest(`/employees/lookups/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
        }),
      });
      formElement.reset();
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

  async function openAdminAction(employee: Employee, kind: 'account' | 'deletion-impact'): Promise<void> {
    if (adminBusyRef.current || saving) return;
    adminBusyRef.current = true; setAdminBusy(true);
    try {
      if (!(await confirmDiscardEmployee())) return;
      setError(''); setMessage('');
      setAccountView(null); setDeletion(null); setEditing(null); setStatusEmployee(null); setHistoryState(null);
      setEmployeeDirty(false); setCreateFormVersion(version => version + 1);
      setCreateOpen(false); setLookupOpen(false); setActionEmployee(null);
      if (kind === 'account') setAccountView(await apiRequest<AccountView>(`/employees/${employee.id}/account`));
      else setDeletion(await apiRequest<DeletionImpact>(`/employees/${employee.id}/deletion-impact`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải thông tin thao tác.'); }
    finally { adminBusyRef.current = false; setAdminBusy(false); }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!accountView?.account || adminBusyRef.current) return;
    const form = event.currentTarget, data = new FormData(form);
    const password = String(data.get('newPassword') ?? '');
    if (password !== String(data.get('confirmPassword') ?? '')) { setError('Hai mật khẩu chưa khớp.'); return; }
    adminBusyRef.current = true; setAdminBusy(true); setError(''); setMessage('');
    try {
      const confirmed = await requestAction({ title: 'Đặt lại mật khẩu?', description: `Tài khoản ${accountView.account.username}: thu hồi mọi phiên Web/App và ngừng push trên thiết bị cũ. Không tự mở lại hồ sơ ngừng hoạt động.`, confirmLabel: 'Đặt lại mật khẩu', danger: true });
      if (confirmed === null) return;
      const result = await apiRequest<{ currentAccountInvalidated: boolean }>(`/employees/${accountView.employeeId}/account/reset-password`, {
        method: 'POST', body: JSON.stringify({ newPassword: password, reason: data.get('reason') }),
      });
      form.reset();
      if (result.currentAccountInvalidated) { window.location.replace('/login'); return; }
      setProfileRevision(value => value + 1);
      setMessage(`Đã đặt lại mật khẩu cho ${accountView.account.username}. Nhân viên cần đăng nhập lại bằng mật khẩu Admin vừa cấp.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể đặt lại mật khẩu.'); }
    finally { adminBusyRef.current = false; setAdminBusy(false); }
  }

  async function deleteEmployee(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deletion || adminBusyRef.current) return;
    const data = new FormData(event.currentTarget);
    if (data.get('employeeCode') !== deletion.employeeCode) { setError('Nhập chính xác mã nhân viên để xác nhận.'); return; }
    adminBusyRef.current = true; setAdminBusy(true); setError(''); setMessage('');
    try {
      const confirmed = await requestAction({ title: `Xóa vĩnh viễn ${deletion.fullName}?`, description: 'Hồ sơ và dữ liệu riêng liệt kê bên dưới sẽ bị xóa, kể cả dữ liệu kỳ công đã chốt. Báo cáo sẽ thay đổi. Không thể khôi phục từ giao diện. Đảm bảo đã lưu hồ sơ cần thiết bên HCNS.', confirmLabel: 'Xóa vĩnh viễn', danger: true });
      if (confirmed === null) return;
      const result = await apiRequest<{ currentAccountInvalidated: boolean; evidenceCleanupPending: number }>(`/employees/${deletion.employeeId}`, {
        method: 'DELETE', body: JSON.stringify({ employeeCode: data.get('employeeCode'), reason: data.get('reason'), confirmationToken: deletion.confirmationToken }),
      });
      setDeletion(null);
      if (result.currentAccountInvalidated) { window.location.replace('/login'); return; }
      setProfileEmployee(null);
      setMessage('Đã xóa vĩnh viễn nhân sự. Chỉ có thể phục hồi bằng bản sao lưu quản trị.' + (result.evidenceCleanupPending !== 0 ? ' Một số ảnh đang chờ dọn tệp; hệ thống sẽ thử lại.' : ''));
      await load(1);
    } catch (caught) {
      setDeletion(null);
      setError((caught instanceof Error ? caught.message : 'Không thể xóa nhân sự.') + ' Mở lại thao tác Xóa để xem ảnh hưởng mới nhất; không tự gửi lại yêu cầu.');
    } finally { adminBusyRef.current = false; setAdminBusy(false); }
  }

  return (
    <div className="module-page employees-page">
      {actionDialog && createPortal(actionDialog, document.body)}
      {canManage && profileEmployee && <EmployeeProfileOverlay
        initialEmployee={profileEmployee} search={appliedSearch} revision={profileRevision} branches={branches}
        obscured={Boolean(editing || createOpen || lookupOpen || actionEmployee || statusEmployee || historyState || accountView || deletion)}
        actionBusy={saving || adminBusy}
        actionError={error} onClose={() => setProfileEmployee(null)} onAction={profileAction}
      />}
      <PageHeader
        description="Quản lý thông tin hồ sơ nhân viên, phòng ban, chức vụ và tài khoản đăng nhập."
        eyebrow="DANH MỤC NHÂN SỰ"
        title="Quản lý nhân viên"
        action={canManage && <div className="employee-header-actions"><button className="secondary-button" type="button" disabled={saving || adminBusy} onClick={() => void openPanel('lookups')}><Network size={16} />Danh mục tổ chức</button><button className="primary-button" type="button" disabled={saving || adminBusy} onClick={() => void openPanel('create')}><Plus size={17} />Thêm nhân viên</button></div>}
      />

      {message && createPortal(<ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>, document.body)}
      {error && <Notice kind="error">{error}</Notice>}
      {adminBusy && <LoadingState />}

      {canManage && accountView && <EmployeePanel title="Tài khoản & mật khẩu" subtitle={`${accountView.employeeCode} · ${accountView.fullName}`} error={error} busy={saving || adminBusy} onClose={() => void closePanel()}><section className="editor-panel employee-detail-panel" id="employee-admin-panel">
        <div className="panel-heading"><div><span className="mono">{accountView.employeeCode}</span><h2>Tài khoản — {accountView.fullName}</h2></div>
          <button className="icon-button" aria-label="Đóng quản lý tài khoản" disabled={adminBusy} type="button" onClick={() => setAccountView(null)}><X size={18} /></button></div>
        {accountView.account ? <>
          <label>Tên đăng nhập<input readOnly value={accountView.account.username} /></label>
          <p className="muted-copy">Tài khoản {accountView.account.isActive ? 'đang hoạt động' : 'đang bị khóa'}. Không thể xem lại mật khẩu cũ; hệ thống chỉ lưu hash.</p>
          <form className="form-grid" onSubmit={resetPassword}>
            <label>Mật khẩu mới<input autoComplete="new-password" name="newPassword" type="password" minLength={6} maxLength={128} required disabled={adminBusy} /></label>
            <label>Nhập lại mật khẩu<input autoComplete="new-password" name="confirmPassword" type="password" minLength={6} maxLength={128} required disabled={adminBusy} /></label>
            <label className="span-2">Lý do đặt lại<textarea name="reason" minLength={5} maxLength={500} required disabled={adminBusy} /></label>
            <p className="span-2 muted-copy">Mật khẩu do Admin chọn, tối thiểu 6 ký tự. Reset sẽ thu hồi tất cả phiên; không lưu hoặc hiển thị lại mật khẩu sau khi hoàn tất.</p>
            <div className="form-actions span-2"><button className="primary-button" disabled={adminBusy}><KeyRound size={16} />{adminBusy ? 'Đang xử lý…' : 'Đặt lại mật khẩu'}</button></div>
          </form>
        </> : <EmptyState title="Chưa cấp tài khoản" description="Hồ sơ này chưa liên kết tài khoản đăng nhập; không có mật khẩu để reset." />}
      </section></EmployeePanel>}

      {canManage && deletion && <EmployeePanel title="Xóa vĩnh viễn nhân sự" subtitle={`${deletion.employeeCode} · ${deletion.fullName}`} error={error} busy={saving || adminBusy} onClose={() => void closePanel()}><section className="editor-panel employee-detail-panel" id="employee-admin-panel">
        <div className="panel-heading"><div><span className="mono">{deletion.employeeCode}</span><h2>Xóa vĩnh viễn — {deletion.fullName}</h2></div>
          <button className="icon-button" aria-label="Đóng xác nhận xóa" disabled={adminBusy} type="button" onClick={() => setDeletion(null)}><X size={18} /></button></div>
        <Notice kind="error">Không giới hạn theo trạng thái hoặc lịch sử. Công, đơn, quỹ phép, kỷ luật, phần tham gia công tác và thông báo riêng sẽ bị xóa; báo cáo kể cả kỳ đã chốt sẽ thay đổi. Phiếu chung/người khác và audit được giữ. Tài khoản không còn đăng nhập được; ID kỹ thuật được giữ cho lịch sử xử lý.</Notice>
        {deletion.isCurrentAccount && <Notice kind="error">Đây là tài khoản Admin bạn đang dùng. Xóa sẽ đăng xuất ngay; nếu không còn Admin khác, bạn sẽ mất quyền quản trị và cần hỗ trợ khôi phục từ bản sao lưu.</Notice>}
        <ul>{Object.entries(deletion.counts).filter(([, count]) => count > 0).map(([key, count]) => <li key={key}>{deletionLabels[key] ?? key}: <strong>{count}</strong></li>)}</ul>
        {!Object.values(deletion.counts).some(count => count > 0) && <p>Chưa có dữ liệu nghiệp vụ liên quan.</p>}
        <p>Không tự chỉ định người phụ trách/duyệt thay. Tuyến mất người duyệt cần Admin phân lại hoặc xử lý dự phòng.</p>
        <form className="form-grid" onSubmit={deleteEmployee}>
          <label>Nhập chính xác mã {deletion.employeeCode}<input name="employeeCode" autoComplete="off" required disabled={adminBusy} /></label>
          <label>Lý do xóa<textarea name="reason" minLength={5} maxLength={500} required disabled={adminBusy} /></label>
          <div className="form-actions span-2"><button className="secondary-button" disabled={adminBusy} type="button" onClick={() => setDeletion(null)}>Hủy</button>
            <button className="danger-button" disabled={adminBusy}><Trash2 size={16} />{adminBusy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}</button></div>
        </form>
      </section></EmployeePanel>}

      <section
        aria-label="Thống kê nhân sự"
        className="employee-metrics"
      >
        <article className="metric-card card-interactive emp-metric-card" data-metric="total">
          <div className="metric-card-top">
            <p>Tổng số nhân sự</p>
            <div className="emp-metric-icon-wrap" style={{ color: 'var(--brand-primary)', background: 'var(--brand-primary-light)' }}>
              <Users size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong>
            {items === null ? '—' : <AnimatedNumber value={total} />}
          </strong>
          <span>Trong kết quả tìm kiếm</span>
        </article>
        <article className="metric-card card-interactive emp-metric-card" data-metric="active">
          <div className="metric-card-top">
            <p>Đang hoạt động</p>
            <div className="emp-metric-icon-wrap" style={{ color: 'var(--emerald-dark)', background: '#ecfdf5' }}>
              <Check size={16} strokeWidth={2.4} />
            </div>
          </div>
          <strong style={{ color: 'var(--emerald-dark)' }}>
            {items === null ? '—' : <AnimatedNumber value={activeEmployees} />}
          </strong>
          <span>Hồ sơ đang hoạt động</span>
        </article>
        <article className="metric-card card-interactive emp-metric-card" data-metric="department">
          <div className="metric-card-top">
            <p>Phòng ban</p>
            <div className="emp-metric-icon-wrap" style={{ color: '#2563eb', background: '#eff6ff' }}>
              <Building2 size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong>
            {items === null ? '—' : <AnimatedNumber value={departments.length} />}
          </strong>
          <span>Đơn vị tổ chức</span>
        </article>
        <article className="metric-card card-interactive emp-metric-card" data-metric="position">
          <div className="metric-card-top">
            <p>Chức vụ / Vị trí</p>
            <div className="emp-metric-icon-wrap" style={{ color: 'var(--brand-accent)', background: '#fff7ed' }}>
              <Briefcase size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong>
            {items === null ? '—' : <AnimatedNumber value={positions.length} />}
          </strong>
          <span>Vị trí chuyên môn</span>
        </article>
        <article className="metric-card card-interactive emp-metric-card" data-metric="branch">
          <div className="metric-card-top">
            <p>Chi nhánh</p>
            <div className="emp-metric-icon-wrap" style={{ color: '#7c3aed', background: '#f5f3ff' }}>
              <MapPin size={16} strokeWidth={2.2} />
            </div>
          </div>
          <strong>
            {items === null ? '—' : <AnimatedNumber value={branches.length} />}
          </strong>
          <span>Phạm vi vận hành</span>
        </article>
      </section>

      {canManage && editing && (
        <EmployeePanel title="Chỉnh sửa hồ sơ" subtitle={`${editing.employeeCode} · ${editing.fullName}`} error={error} busy={saving || adminBusy} onClose={() => void closePanel()}>
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
                        {branches.filter(item=>item.isActive || item.id===assignment.branchId).map((item) => <option disabled={!item.isActive} key={item.id} value={item.id}>{item.name}{!item.isActive ? ' (ngừng sử dụng)' : ''}</option>)}
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
                        {departments.filter(item=>item.isActive || item.id===assignment.departmentId).map((item) => <option disabled={!item.isActive} key={item.id} value={item.id}>{item.name}{!item.isActive ? ' (ngừng sử dụng)' : ''}</option>)}
                      </select>
                    </label>
                    <label>
                      Chức vụ
                      <select
                        onChange={(event) => updateEditAssignment(index, 'positionId', event.target.value)}
                        value={assignment.positionId}
                      >
                        <option value="">Chưa phân chức vụ</option>
                        {positions.filter(item=>item.isActive || item.id===assignment.positionId).map((item) => <option disabled={!item.isActive} key={item.id} value={item.id}>{item.name}{!item.isActive ? ' (ngừng sử dụng)' : ''}</option>)}
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
                {branches.filter(item=>item.isActive || editing.scopeBranchIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}{!item.isActive ? ' (ngừng sử dụng)' : ''}</option>)}
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
        </section></EmployeePanel>
      )}

      {canManage && statusEmployee && (
        <EmployeePanel title={statusEmployee.isActive ? 'Ngừng làm việc' : 'Khôi phục hồ sơ'} subtitle={`${statusEmployee.employeeCode} · ${statusEmployee.fullName}`} error={error} busy={saving || adminBusy} onClose={() => void closePanel()}>
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
        </section></EmployeePanel>
      )}

      {canManage && historyState && (
        <EmployeePanel title="Lịch sử nhân sự" subtitle={`${historyState.employee.employeeCode} · ${historyState.employee.fullName}`} error={error} busy={saving || adminBusy} onClose={() => void closePanel()}>
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
        </section></EmployeePanel>
      )}

      {canManage && createOpen && <EmployeePanel title="Thêm nhân viên" subtitle="Hồ sơ, phân công tổ chức và tài khoản đăng nhập" error={error} busy={saving || adminBusy} onClose={() => void closePanel()}>
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
              {branches.filter(item=>item.isActive).map((item) => (
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
              {departments.filter(item=>item.isActive).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phòng ban kiêm nhiệm
            <select multiple name="additionalDepartmentIds" size={4}>
              {departments.filter(item=>item.isActive).map((item) => (
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
              {positions.filter(item=>item.isActive).map((item) => (
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
              minLength={6}
              maxLength={128}
              name="temporaryPassword"
              placeholder="Tối thiểu 6 ký tự, không yêu cầu loại ký tự"
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
              {branches.filter(item=>item.isActive).map((item) => (
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
      </EmployeePanel>}

      {canManage && lookupOpen && <EmployeePanel title="Danh mục tổ chức" subtitle="Thêm nhanh danh mục. Quản trị vòng đời tại Tổ chức & phân quyền." error={error} busy={saving || adminBusy} onClose={() => void closePanel()}><div className="split-editors">
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
      </div></EmployeePanel>}

      {canManage && actionEmployee && <EmployeePanel title={actionEmployee.fullName} subtitle={actionEmployee.employeeCode} error={error} busy={saving || adminBusy} onClose={() => void closePanel()}>
        <dl className="workflow-facts"><div><dt>Loại nhân viên</dt><dd>{employeeTypeLabels[actionEmployee.employeeType] ?? actionEmployee.employeeType}</dd></div><div><dt>Trạng thái hồ sơ</dt><dd><StatusBadge value={actionEmployee.isActive ? 'ACTIVE' : 'INACTIVE'} /></dd></div><div><dt>Đơn vị</dt><dd>{actionEmployee.organizationAssignments.map(assignment => `${assignment.branchName} · ${assignment.departmentName}`).join('; ') || 'Chưa phân công'}</dd></div></dl>
        <div className="employee-action-list">
          <button type="button" className="secondary-button" onClick={() => void beginEdit(actionEmployee)}><Pencil size={17} />Sửa hồ sơ & phân công</button>
          <button type="button" className="secondary-button" onClick={() => void openAdminAction(actionEmployee, 'account')}><KeyRound size={17} />Tài khoản / Reset mật khẩu</button>
          <button type="button" className="secondary-button" onClick={() => void viewHistory(actionEmployee)}><History size={17} />Xem lịch sử</button>
          <button type="button" className="secondary-button" onClick={() => void beginStatusChange(actionEmployee)}>{actionEmployee.isActive ? <Archive size={17} /> : <RotateCcw size={17} />}{actionEmployee.isActive ? 'Ghi nhận ngừng làm việc' : 'Khôi phục hồ sơ'}</button>
          <div className="employee-danger-zone"><p>Thao tác không thể khôi phục từ giao diện</p><button type="button" className="danger-button" onClick={() => void openAdminAction(actionEmployee, 'deletion-impact')}><Trash2 size={17} />Xóa vĩnh viễn nhân sự</button></div>
        </div>
      </EmployeePanel>}

      <section className="employee-directory" aria-label="Danh sách nhân viên">
        <header className="employee-directory-heading">
          <div>
            <h2>Danh sách nhân viên</h2>
            <p>Hồ sơ, đơn vị và trạng thái tài khoản trong phạm vi được cấp.</p>
          </div>
          <div className="emp-heading-badges">
            {quickFilter !== 'ALL' && (
              <span className="emp-filter-indicator">
                Lọc: <strong>{quickFilter === 'ACTIVE' ? 'Đang làm việc' : quickFilter === 'INACTIVE' ? 'Đã ngừng' : quickFilter === 'OFFICE' ? 'Văn phòng' : 'Kỹ thuật'}</strong>
              </span>
            )}
            <span className="emp-total-badge">
              {items === null ? 'Đang tải…' : `${filteredItems?.length ?? 0} / ${total} hồ sơ`}
            </span>
          </div>
        </header>

        <div className="emp-toolbar-row">
          <form className="toolbar employee-search" onSubmit={(event) => { event.preventDefault(); setItems(null); setError(''); void load(1, search).catch((caught) => { setError(caught instanceof Error ? caught.message : 'Không thể tìm nhân viên.'); setItems([]); }); }}>
            <label><span className="visually-hidden">Tìm nhân viên</span><span className="employee-search-field"><Search size={16} aria-hidden="true" /><input aria-label="Tìm theo mã hoặc họ tên" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo mã nhân viên hoặc họ tên…" value={search} /></span></label>
            <button className="secondary-button" type="submit">Tìm kiếm</button>
            {search && <button className="table-action" onClick={() => { setSearch(''); setItems(null); setError(''); void load(1, '').catch((caught) => { setError(caught instanceof Error ? caught.message : 'Không thể xóa bộ lọc.'); setItems([]); }); }} type="button">Xóa tìm kiếm</button>}
          </form>

          <div className="emp-quick-filters" role="group" aria-label="Bộ lọc nhanh trạng thái và phân loại">
            <button
              type="button"
              className={`emp-filter-chip${quickFilter === 'ALL' ? ' is-active' : ''}`}
              onClick={() => setQuickFilter('ALL')}
            >
              <span>Tất cả</span>
              <span className="emp-chip-count">{items === null ? '…' : total}</span>
            </button>
            <button
              type="button"
              className={`emp-filter-chip${quickFilter === 'ACTIVE' ? ' is-active' : ''}`}
              onClick={() => setQuickFilter('ACTIVE')}
            >
              <span className="emp-chip-dot is-active" />
              <span>Đang làm việc</span>
              <span className="emp-chip-count">{items === null ? '…' : activeTotal}</span>
            </button>
            <button
              type="button"
              className={`emp-filter-chip${quickFilter === 'INACTIVE' ? ' is-active' : ''}`}
              onClick={() => setQuickFilter('INACTIVE')}
            >
              <span className="emp-chip-dot is-inactive" />
              <span>Đã ngừng</span>
              <span className="emp-chip-count">{items === null ? '…' : Math.max(0, total - activeTotal)}</span>
            </button>
            <button
              type="button"
              className={`emp-filter-chip${quickFilter === 'OFFICE' ? ' is-active' : ''}`}
              onClick={() => setQuickFilter('OFFICE')}
            >
              <Building2 size={13} />
              <span>Văn phòng</span>
            </button>
            <button
              type="button"
              className={`emp-filter-chip${quickFilter === 'TECHNICAL' ? ' is-active' : ''}`}
              onClick={() => setQuickFilter('TECHNICAL')}
            >
              <Briefcase size={13} />
              <span>Kỹ thuật / Hiện trường</span>
            </button>
          </div>
        </div>

        {items === null ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            description={search ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem toàn bộ nhân viên.' : 'Dùng nút Thêm nhân viên nếu bạn có quyền quản trị.'}
            title={search ? 'Không tìm thấy nhân viên' : 'Chưa có nhân viên'}
          />
        ) : filteredItems && filteredItems.length === 0 ? (
          <div className="emp-filter-empty">
            <p>Không có nhân viên nào trong trang hiện tại phù hợp với bộ lọc đã chọn.</p>
            <button type="button" className="secondary-button" onClick={() => setQuickFilter('ALL')}>
              Hiển thị tất cả nhân viên ({items.length})
            </button>
          </div>
        ) : (
          <>
            <div className="employee-directory-top-pagination">
              <Pagination page={page} pageSize={employeePageSize} total={total} onPageChange={changeEmployeePage} />
            </div>
            <div className="table-wrap compact-table-wrap">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Công việc</th>
                    <th>Đơn vị công tác</th>
                    <th>Tài khoản</th>
                    <th>Trạng thái</th>
                    {canManage && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems?.map((item) => (
                    <tr
                      key={item.id}
                      className={canManage ? 'employee-profile-row' : undefined}
                      onClick={canManage ? (event) => {
                        if ((event.target as HTMLElement).closest('button,a,input,select,textarea') || window.getSelection()?.toString()) return;
                        void openProfile(item);
                      } : undefined}
                    >
                      <td>
                        <div className="employee-person-row">
                          {canManage ? (
                            <button
                              type="button"
                              className="employee-profile-trigger"
                              disabled={adminBusy || saving}
                              onClick={() => void openProfile(item)}
                            >
                              <span className="employee-initial" aria-hidden="true">
                                {item.fullName.trim().slice(0, 1).toLocaleUpperCase('vi')}
                              </span>
                              <div className="employee-name-block">
                                <strong>{item.fullName}</strong>
                              </div>
                            </button>
                          ) : (
                            <div className="employee-person">
                              <span className="employee-initial" aria-hidden="true">
                                {item.fullName.trim().slice(0, 1).toLocaleUpperCase('vi')}
                              </span>
                              <div className="employee-name-block">
                                <strong>{item.fullName}</strong>
                              </div>
                            </div>
                          )}
                          <div className="emp-badges-inline">
                            <span className="emp-code-chip" title="Mã nhân viên (Bấm để sao chép)">
                              <span>{item.employeeCode}</span>
                              <button
                                type="button"
                                className={`emp-inline-copy-btn${copiedKey === `code-${item.id}` ? ' is-copied' : ''}`}
                                aria-label={`Sao chép mã ${item.employeeCode}`}
                                title="Sao chép mã nhân viên"
                                onClick={(e) => copyInline(item.employeeCode, `code-${item.id}`, e)}
                              >
                                {copiedKey === `code-${item.id}` ? (
                                  <Check size={11} className="copy-success-icon" />
                                ) : (
                                  <Copy size={11} />
                                )}
                              </button>
                            </span>
                            {item.phone && (
                              <span className="emp-phone-chip" title="Số điện thoại (Bấm để sao chép)">
                                <Phone size={10} className="emp-phone-icon" />
                                <span>{item.phone}</span>
                                <button
                                  type="button"
                                  className={`emp-inline-copy-btn${copiedKey === `phone-${item.id}` ? ' is-copied' : ''}`}
                                  aria-label={`Sao chép số điện thoại ${item.phone}`}
                                  title="Sao chép số điện thoại"
                                  onClick={(e) => copyInline(item.phone!, `phone-${item.id}`, e)}
                                >
                                  {copiedKey === `phone-${item.id}` ? (
                                    <Check size={11} className="copy-success-icon" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </button>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="employee-cell-stack">
                          <strong>
                            {item.organizationAssignments.find((assignment) => assignment.isPrimary)?.positionName ??
                              item.position?.name ??
                              'Chưa phân chức vụ'}
                          </strong>
                          <small>{employeeTypeLabels[item.employeeType] ?? item.employeeType}</small>
                        </div>
                      </td>
                      <td>
                        <div className="employee-cell-stack">
                          <strong>
                            {item.organizationAssignments
                              .map((assignment) => (assignment.isPrimary ? `${assignment.departmentName} (chính)` : assignment.departmentName))
                              .join(', ') || item.department?.name || '—'}
                          </strong>
                          <small>
                            {[...new Set(item.organizationAssignments.map((assignment) => assignment.branchName))].join(', ') || '—'}
                          </small>
                        </div>
                      </td>
                      <td>
                        <small style={{ color: 'var(--muted)' }}>
                          {item.hasAccount ? 'Đã cấp tài khoản' : 'Chưa cấp tài khoản'}
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
                      {canManage && (
                        <td>
                          <div className="action-group employee-actions">
                            <button
                              className="table-action"
                              disabled={adminBusy || saving}
                              onClick={() => void beginEdit(item)}
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={14} /> Sửa
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Thao tác với ${item.fullName}`}
                              title="Tài khoản, lịch sử và thao tác khác"
                              disabled={adminBusy || saving}
                              type="button"
                              onClick={() => void openPanel('actions', item)}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={employeePageSize} total={total} onPageChange={changeEmployeePage} />
          </>
        )}
      </section>
    </div>
  );
}
