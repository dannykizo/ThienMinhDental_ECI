'use client';

import {
  BriefcaseBusiness,
  Building2,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  Pagination,
  StatusBadge,
  ToastNotice,
  formatDate,
} from '@/components/admin-ui';
import { apiRequest, apiUrl } from '@/lib/auth-api';
import { useActionDialog } from '@/components/use-action-dialog';
import { useClientPagination } from '@/lib/use-client-pagination';

interface TripMember {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  note: string | null;
  evidenceImageReference: string | null;
  evidenceCapturedAt: string | null;
}

interface Trip {
  id: string;
  code: string;
  customerId: string | null;
  responsibleEmployeeId: string | null;
  siteName: string;
  siteAddress: string;
  startAt: string;
  endAt: string;
  content: string;
  requiresPhoto: boolean;
  status: string;
  cancelReason: string | null;
  customerName: string | null;
  customerContactName: string | null;
  customerContactPhone: string | null;
  responsibleEmployeeName: string | null;
  memberCount: number;
  memberNames: string;
  members: TripMember[];
}

interface Customer {
  id: string;
  name: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  isActive: boolean;
  tripCount: number;
}

interface EmployeeAssignment {
  departmentId: string;
  departmentName: string;
  branchName: string;
  isPrimary: boolean;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  isActive: boolean;
  organizationAssignments: EmployeeAssignment[];
}

interface Department {
  id: string;
  name: string;
  isActive: boolean;
}

interface AuditItem {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
}

function evidenceHref(reference: string): string {
  return `${new URL(apiUrl).origin}${reference}`;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function defaultStart(): string {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  return toLocalInput(value.toISOString());
}

function defaultEnd(): string {
  const value = new Date();
  value.setHours(value.getHours() + 3, 0, 0, 0);
  return toLocalInput(value.toISOString());
}

export default function BusinessTripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showInactiveCustomers, setShowInactiveCustomers] = useState(false);
  const [history, setHistory] = useState<{
    tripId: string;
    items: AuditItem[];
  } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { request: requestAction, dialog: actionDialog } = useActionDialog();

  async function load(): Promise<void> {
    const [tripRows, customerRows, employeeRows, departmentRows] =
      await Promise.all([
        apiRequest<Trip[]>('/business-trips'),
        apiRequest<Customer[]>('/business-trips/customers'),
        apiRequest<Employee[]>('/employees'),
        apiRequest<Department[]>('/employees/lookups/departments'),
      ]);
    setTrips(tripRows);
    setCustomers(customerRows);
    setEmployees(employeeRows);
    setDepartments(departmentRows);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() =>
        setError('Không thể tải dữ liệu phiếu công tác.'),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function resetTripEditor(): void {
    setEditing(null);
    setSelectedDepartmentId('');
    setResponsibleEmployeeId('');
    setSelectedMemberIds([]);
  }

  function beginTripEdit(trip: Trip): void {
    setEditing(trip);
    setResponsibleEmployeeId(trip.responsibleEmployeeId ?? '');
    setSelectedMemberIds(trip.members.map((member) => member.employeeId));
    const responsible = employees.find(
      (employee) => employee.id === trip.responsibleEmployeeId,
    );
    setSelectedDepartmentId(
      responsible?.organizationAssignments.find((row) => row.isPrimary)
        ?.departmentId ?? '',
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeDepartment(departmentId: string): void {
    setSelectedDepartmentId(departmentId);
    if (!responsibleEmployeeId) return;
    const responsible = employees.find(
      (employee) => employee.id === responsibleEmployeeId,
    );
    const remainsVisible =
      !departmentId ||
      responsible?.organizationAssignments.some(
        (assignment) => assignment.departmentId === departmentId,
      );
    if (!remainsVisible) setResponsibleEmployeeId('');
  }

  function changeResponsible(employeeId: string): void {
    setResponsibleEmployeeId(employeeId);
    if (employeeId) {
      setSelectedMemberIds((current) =>
        current.includes(employeeId) ? current : [...current, employeeId],
      );
    }
  }

  function toggleMember(employeeId: string, checked: boolean): void {
    if (!checked && employeeId === responsibleEmployeeId) return;
    setSelectedMemberIds((current) =>
      checked
        ? [...new Set([...current, employeeId])]
        : current.filter((id) => id !== employeeId),
    );
  }

  function beginCustomerEdit(customer: Customer): void {
    setEditingCustomer(customer);
    setTimeout(() =>
      document
        .getElementById('customer-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  async function saveTrip(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!responsibleEmployeeId || selectedMemberIds.length === 0) {
      setError('Hãy chọn người phụ trách và ít nhất một thành viên.');
      return;
    }
    const body = {
      customerId: form.get('customerId') || null,
      responsibleEmployeeId,
      siteName: form.get('siteName'),
      siteAddress: form.get('siteAddress'),
      startAt: new Date(String(form.get('startAt'))).toISOString(),
      endAt: new Date(String(form.get('endAt'))).toISOString(),
      content: form.get('content'),
      requiresPhoto: form.get('requiresPhoto') === 'on',
      memberIds: selectedMemberIds,
    };
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = editing
        ? await apiRequest<Trip>(`/business-trips/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : await apiRequest<Trip>('/business-trips', {
            method: 'POST',
            body: JSON.stringify(body),
          });
      setMessage(
        editing
          ? `Đã cập nhật phiếu nháp ${editing.code} và lưu audit.`
          : `Đã tự sinh mã ${saved.code} và tạo phiếu ở trạng thái nháp.`,
      );
      resetTripEditor();
      formElement.reset();
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Không thể lưu phiếu công tác.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function transition(
    id: string,
    status: 'ASSIGNED' | 'CANCELLED',
  ): Promise<void> {
    const reason = await requestAction({ title: status === 'ASSIGNED' ? 'Giao phiếu công tác' : 'Hủy phiếu công tác', description: status === 'ASSIGNED' ? 'Phiếu sẽ được giao cho các thành viên và xuất hiện trên ứng dụng nhân viên.' : 'Phiếu sẽ ngừng xử lý; lý do được lưu trong audit.', confirmLabel: status === 'ASSIGNED' ? 'Xác nhận giao phiếu' : 'Xác nhận hủy', fieldLabel: status === 'CANCELLED' ? 'Lý do hủy' : undefined, required: status === 'CANCELLED', minLength: status === 'CANCELLED' ? 5 : undefined, danger: status === 'CANCELLED' });
    if (reason === null) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/business-trips/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: reason?.trim() || undefined }),
      });
      setMessage(
        status === 'ASSIGNED'
          ? 'Đã giao phiếu cho các thành viên.'
          : 'Đã hủy phiếu và lưu lý do.',
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Không thể chuyển trạng thái.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function showHistory(tripId: string): Promise<void> {
    try {
      setHistory({
        tripId,
        items: await apiRequest<AuditItem[]>(
          `/business-trips/${tripId}/history`,
        ),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Không thể tải lịch sử phiếu.',
      );
    }
  }

  async function saveCustomer(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      name: form.get('name'),
      address: form.get('address'),
      contactName: form.get('contactName') || null,
      contactPhone: form.get('contactPhone') || null,
    };
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        editingCustomer
          ? `/business-trips/customers/${editingCustomer.id}`
          : '/business-trips/customers',
        {
          method: editingCustomer ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      setMessage(
        editingCustomer
          ? 'Đã cập nhật thông tin khách hàng.'
          : 'Đã thêm khách hàng / phòng khám.',
      );
      setEditingCustomer(null);
      formElement.reset();
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Không thể lưu khách hàng.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleCustomer(customer: Customer): Promise<void> {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/business-trips/customers/${customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !customer.isActive }),
      });
      setMessage(
        customer.isActive
          ? 'Đã ngừng sử dụng khách hàng; các phiếu cũ vẫn được giữ nguyên.'
          : 'Đã khôi phục khách hàng.',
      );
      if (editingCustomer?.id === customer.id) setEditingCustomer(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Không thể đổi trạng thái khách hàng.',
      );
    } finally {
      setSaving(false);
    }
  }

  const metrics = useMemo(
    () => ({
      draft: trips?.filter((trip) => trip.status === 'DRAFT').length ?? 0,
      assigned:
        trips?.filter((trip) => trip.status === 'ASSIGNED').length ?? 0,
      active:
        trips?.filter((trip) => trip.status === 'IN_PROGRESS').length ?? 0,
      evidence:
        trips?.filter(
          (trip) =>
            trip.requiresPhoto &&
            !['COMPLETED', 'CANCELLED'].includes(trip.status),
        ).length ?? 0,
    }),
    [trips],
  );
  const visibleTrips =
    trips?.filter(
      (trip) =>
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE'
          ? !['COMPLETED', 'CANCELLED'].includes(trip.status)
          : trip.status === statusFilter),
    ) ?? [];
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const candidateEmployees = activeEmployees.filter(
    (employee) =>
      !selectedDepartmentId ||
      employee.organizationAssignments.some(
        (assignment) => assignment.departmentId === selectedDepartmentId,
      ),
  );
  const customerOptions = customers.filter(
    (customer) => customer.isActive || customer.id === editing?.customerId,
  );
  const visibleCustomers = customers.filter((customer) => {
    const query = customerSearch.trim().toLocaleLowerCase('vi');
    const matchesSearch =
      !query ||
      [customer.name, customer.address, customer.contactName, customer.contactPhone]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('vi').includes(query));
    return matchesSearch && (showInactiveCustomers || customer.isActive);
  });
  const tripPaging = useClientPagination(visibleTrips, 20);
  const customerPaging = useClientPagination(visibleCustomers, 12);

  return (
    <div className="module-page">
      {actionDialog}
      <PageHeader
        description="Admin tạo và giao phiếu; mã phiếu được Backend cấp tự động, nhân sự được lọc theo phòng ban và khách hàng được quản lý tập trung."
        eyebrow="CR3 / PHIẾU CÔNG TÁC"
        title="Điều phối công tác"
      />
      {message && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}
      {error && <Notice kind="error">{error}</Notice>}

      <section className="metric-grid">
        <article className="metric-card"><p>Phiếu nháp</p><strong>{metrics.draft}</strong><span>Đang chuẩn bị nội dung</span></article>
        <article className="metric-card"><p>Đã giao</p><strong>{metrics.assigned}</strong><span>Chờ nhân viên bắt đầu</span></article>
        <article className="metric-card"><p>Đang thực hiện</p><strong>{metrics.active}</strong><span>Có thành viên tại hiện trường</span></article>
        <article className="metric-card"><p>Yêu cầu ảnh</p><strong>{metrics.evidence}</strong><span>Cần bằng chứng khi hoàn tất</span></article>
      </section>

      <div className="toolbar">
        <label>
          Trạng thái
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); tripPaging.setPage(1); }}>
            <option value="ACTIVE">Đang vận hành</option><option value="ALL">Tất cả</option><option value="DRAFT">Nháp</option><option value="ASSIGNED">Đã giao</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="COMPLETED">Hoàn tất</option><option value="CANCELLED">Đã hủy</option>
          </select>
        </label>
      </div>

      <details className="editor-panel" open>
        <summary><span className="summary-label">{editing ? <Pencil aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}{editing ? `Chỉnh sửa phiếu nháp ${editing.code}` : 'Tạo phiếu công tác'}</span></summary>
        <form className="form-grid" key={editing?.id ?? 'create'} onSubmit={saveTrip}>
          <div className="generated-code-field"><BriefcaseBusiness aria-hidden="true" size={19} /><span><strong>{editing?.code ?? 'Tự sinh khi lưu'}</strong><small>Quy tắc CT-YYYYMM-NNNN</small></span></div>
          <label>Khách hàng<select name="customerId" defaultValue={editing?.customerId ?? ''}><option value="">Không chọn</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.isActive ? '' : ' · Đã ngừng'}</option>)}</select></label>
          <label>Phòng ban phụ trách<select value={selectedDepartmentId} onChange={(event) => changeDepartment(event.target.value)}><option value="">Tất cả phòng ban</option>{departments.filter((department) => department.isActive).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label>Người phụ trách<select required value={responsibleEmployeeId} onChange={(event) => changeResponsible(event.target.value)}><option value="">Chọn người phụ trách</option>{candidateEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.fullName}</option>)}</select></label>
          <label>Tên địa điểm<input name="siteName" defaultValue={editing?.siteName ?? ''} required /></label>
          <label className="span-2">Địa chỉ<input name="siteAddress" defaultValue={editing?.siteAddress ?? ''} required /></label>
          <label>Bắt đầu<input name="startAt" type="datetime-local" defaultValue={editing ? toLocalInput(editing.startAt) : defaultStart()} required /></label>
          <label>Kết thúc<input name="endAt" type="datetime-local" defaultValue={editing ? toLocalInput(editing.endAt) : defaultEnd()} required /></label>
          <label className="span-2">Nội dung công việc<textarea name="content" defaultValue={editing?.content ?? ''} required /></label>
          <fieldset className="span-2 check-list trip-member-picker">
            <legend>Thành viên trong phòng ban đang chọn · đã chọn {selectedMemberIds.length}</legend>
            {candidateEmployees.length === 0 ? <p>Không có nhân viên đang hoạt động trong phòng ban này.</p> : candidateEmployees.map((employee) => (
              <label key={employee.id}>
                <input checked={selectedMemberIds.includes(employee.id)} disabled={employee.id === responsibleEmployeeId} onChange={(event) => toggleMember(employee.id, event.target.checked)} type="checkbox" />
                <span>{employee.employeeCode} · {employee.fullName}<small>{employee.organizationAssignments.map((row) => row.departmentName).join(' · ')}</small></span>
              </label>
            ))}
          </fieldset>
          <label className="check-inline"><input name="requiresPhoto" type="checkbox" defaultChecked={editing?.requiresPhoto} />Bắt buộc ảnh hiện trường khi hoàn tất</label>
          <span className="action-group"><button className="primary-button form-action" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo phiếu nháp'}</button>{editing && <button className="secondary-button" type="button" onClick={resetTripEditor}>Hủy chỉnh sửa</button>}</span>
        </form>
      </details>

      <details className="editor-panel customer-management-panel" id="customer-editor" open>
        <summary><span className="summary-label"><Building2 aria-hidden="true" size={17} />Quản lý khách hàng / phòng khám</span></summary>
        <form className="form-grid compact" key={editingCustomer?.id ?? 'new-customer'} onSubmit={saveCustomer}>
          <label>Tên khách hàng<input name="name" defaultValue={editingCustomer?.name ?? ''} required /></label>
          <label>Địa chỉ<input name="address" defaultValue={editingCustomer?.address ?? ''} required /></label>
          <label>Người liên hệ<input name="contactName" defaultValue={editingCustomer?.contactName ?? ''} /></label>
          <label>Điện thoại<input name="contactPhone" defaultValue={editingCustomer?.contactPhone ?? ''} /></label>
          <div className="form-actions span-2">{editingCustomer && <button className="secondary-button" type="button" onClick={() => setEditingCustomer(null)}>Hủy chỉnh sửa</button>}<button className="primary-button" disabled={saving}>{saving ? 'Đang lưu…' : editingCustomer ? 'Lưu khách hàng' : 'Thêm khách hàng'}</button></div>
        </form>
        <div className="customer-directory-toolbar">
          <label className="search-box"><Search aria-hidden="true" size={16} /><input aria-label="Tìm khách hàng" placeholder="Tìm theo tên, địa chỉ, liên hệ…" value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); customerPaging.setPage(1); }} /></label>
          <label className="check-inline"><input checked={showInactiveCustomers} onChange={(event) => { setShowInactiveCustomers(event.target.checked); customerPaging.setPage(1); }} type="checkbox" />Hiện khách hàng đã ngừng</label>
        </div>
        {visibleCustomers.length === 0 ? <p className="panel-empty-copy">Chưa có khách hàng phù hợp bộ lọc.</p> : (
          <><div className="customer-directory">{customerPaging.items.map((customer) => (
            <article className="customer-card" key={customer.id}>
              <div><h3>{customer.name}</h3><p>{customer.address}</p><small>{customer.contactName || 'Chưa có người liên hệ'}{customer.contactPhone ? ` · ${customer.contactPhone}` : ''}</small></div>
              <div><StatusBadge value={customer.isActive ? 'ACTIVE' : 'INACTIVE'} /><span>{customer.tripCount} phiếu công tác</span><div className="action-group"><button className="table-action" onClick={() => beginCustomerEdit(customer)} type="button">Sửa</button><button className="table-action" disabled={saving} onClick={() => void toggleCustomer(customer)} type="button">{customer.isActive ? 'Ngừng sử dụng' : 'Khôi phục'}</button></div></div>
            </article>
          ))}</div><Pagination page={customerPaging.page} pageSize={customerPaging.pageSize} total={visibleCustomers.length} onPageChange={customerPaging.setPage} /></>
        )}
      </details>

      {trips === null ? <LoadingState /> : visibleTrips.length === 0 ? <EmptyState title="Chưa có phiếu phù hợp" description="Tạo phiếu nháp mới hoặc thay đổi bộ lọc trạng thái." /> : (
        <><div className="card-list">{tripPaging.items.map((trip) => (
          <article className="list-card trip-card" key={trip.id}>
            <div><p className="mono">{trip.code} · {trip.customerName ?? 'Không gắn khách hàng'}</p><h3>{trip.siteName}</h3><p>{trip.siteAddress}</p><p>{trip.content}</p><small>{formatDate(trip.startAt)} → {formatDate(trip.endAt)} · Phụ trách: {trip.responsibleEmployeeName ?? 'Chưa xác định'}{trip.requiresPhoto ? ' · Bắt buộc ảnh' : ''}</small><div className="trip-member-list">{trip.members.map((member) => <span key={member.employeeId}><strong>{member.fullName}</strong> <StatusBadge value={member.status} />{member.evidenceImageReference ? <> · <a href={evidenceHref(member.evidenceImageReference)} rel="noreferrer" target="_blank">Mở ảnh</a></> : ''}</span>)}</div>{trip.cancelReason && <p><strong>Lý do hủy:</strong> {trip.cancelReason}</p>}{history?.tripId === trip.id && <div className="trip-history"><strong>Lịch sử thao tác</strong>{history.items.map((item) => <small key={item.id}>{formatDate(item.createdAt)} · {item.actorName} · {item.action}</small>)}</div>}</div>
            <div><StatusBadge value={trip.status} /><button className="table-action" onClick={() => void showHistory(trip.id)}>Lịch sử</button>{trip.status === 'DRAFT' && <><button className="table-action" onClick={() => beginTripEdit(trip)}>Chỉnh sửa</button><button className="table-action success-action" disabled={saving} onClick={() => void transition(trip.id, 'ASSIGNED')}>Giao phiếu</button></>}{!['COMPLETED', 'CANCELLED'].includes(trip.status) && <button className="table-action danger-action" disabled={saving} onClick={() => void transition(trip.id, 'CANCELLED')}>Hủy phiếu</button>}</div>
          </article>
        ))}</div><Pagination page={tripPaging.page} pageSize={tripPaging.pageSize} total={visibleTrips.length} onPageChange={tripPaging.setPage} /></>
      )}
    </div>
  );
}
