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

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
}

interface Leave {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  reviewNote?: string;
}

const leaveTypeMap: Record<string, string> = {
  ANNUAL: 'Phép năm',
  SICK: 'Nghỉ bệnh',
  UNPAID: 'Không lương',
  OTHER: 'Khác',
};

export default function LeavePage() {
  const [items, setItems] = useState<Leave[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const nameOf = (id: string) =>
    employees.find((employee) => employee.id === id)?.fullName ?? id;

  async function load(): Promise<void> {
    const [leaves, people] = await Promise.all([
      apiRequest<Leave[]>('/leave-requests'),
      apiRequest<Employee[]>('/employees'),
    ]);
    setItems(leaves);
    setEmployees(people);
  }

  useEffect(() => {
    Promise.all([
      apiRequest<Leave[]>('/leave-requests'),
      apiRequest<Employee[]>('/employees'),
    ])
      .then(([leaves, people]) => {
        setItems(leaves);
        setEmployees(people);
      })
      .catch(() => setError('Không thể tải đơn nghỉ phép.'));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/leave-requests', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: form.get('employeeId'),
          leaveType: form.get('leaveType'),
          startDate: form.get('startDate'),
          endDate: form.get('endDate'),
          reason: form.get('reason'),
        }),
      });
      event.currentTarget.reset();
      setMessage('Đã gửi đơn nghỉ phép thành công.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo đơn.');
    }
  }

  async function review(id: string, status: string): Promise<void> {
    const note = window.prompt(
      status === 'APPROVED' ? 'Ghi chú duyệt (không bắt buộc)' : 'Lý do từ chối',
    );
    if (status === 'REJECTED' && !note) return;

    try {
      await apiRequest(`/leave-requests/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reviewNote: note || undefined,
        }),
      });
      setMessage(
        `Đã ${status === 'APPROVED' ? 'phê duyệt' : 'từ chối'} đơn nghỉ.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể duyệt đơn.');
    }
  }

  const allCount = items?.length ?? 0;
  const pendingCount =
    items?.filter((i) => i.status === 'SUBMITTED').length ?? 0;
  const approvedCount =
    items?.filter((i) => i.status === 'APPROVED').length ?? 0;
  const rejectedCount =
    items?.filter((i) => i.status === 'REJECTED').length ?? 0;

  const filteredItems = items
    ? statusFilter === 'ALL'
      ? items
      : items.filter((i) => i.status === statusFilter)
    : null;

  return (
    <div className="module-page">
      <PageHeader
        description="Theo dõi và phê duyệt đơn xin nghỉ phép của nhân viên tại chi nhánh."
        eyebrow="QUẢN LÝ ĐƠN TỪ"
        title="Đơn nghỉ phép"
      />

      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {/* Filter KPI Bar (Học hỏi từ Ảnh 9) */}
      <section
        aria-label="Thống kê trạng thái đơn"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}
      >
        <button
          className="metric-card"
          onClick={() => setStatusFilter('ALL')}
          style={{
            cursor: 'pointer',
            textAlign: 'left',
            outline:
              statusFilter === 'ALL'
                ? '2px solid var(--brand-primary)'
                : 'none',
          }}
          type="button"
        >
          <p>Tất cả đơn</p>
          <strong>{allCount}</strong>
          <span>Tổng số đơn đã nhận</span>
        </button>

        <button
          className="metric-card"
          onClick={() => setStatusFilter('SUBMITTED')}
          style={{
            cursor: 'pointer',
            textAlign: 'left',
            outline:
              statusFilter === 'SUBMITTED'
                ? '2px solid var(--brand-gold)'
                : 'none',
          }}
          type="button"
        >
          <div className="metric-card-top">
            <p>Đang chờ duyệt</p>
            <span style={{ color: 'var(--brand-gold)' }}>⏳</span>
          </div>
          <strong style={{ color: pendingCount > 0 ? '#b45309' : 'inherit' }}>
            {pendingCount}
          </strong>
          <span>Cần quản lý xử lý</span>
        </button>

        <button
          className="metric-card"
          onClick={() => setStatusFilter('APPROVED')}
          style={{
            cursor: 'pointer',
            textAlign: 'left',
            outline:
              statusFilter === 'APPROVED'
                ? '2px solid var(--emerald)'
                : 'none',
          }}
          type="button"
        >
          <div className="metric-card-top">
            <p>Đã chấp thuận</p>
            <span style={{ color: 'var(--emerald)' }}>✓</span>
          </div>
          <strong style={{ color: 'var(--emerald-dark)' }}>
            {approvedCount}
          </strong>
          <span>Đã phê duyệt</span>
        </button>

        <button
          className="metric-card"
          onClick={() => setStatusFilter('REJECTED')}
          style={{
            cursor: 'pointer',
            textAlign: 'left',
            outline:
              statusFilter === 'REJECTED'
                ? '2px solid var(--danger)'
                : 'none',
          }}
          type="button"
        >
          <div className="metric-card-top">
            <p>Đã từ chối</p>
            <span style={{ color: 'var(--danger)' }}>✕</span>
          </div>
          <strong style={{ color: 'var(--danger-dark)' }}>
            {rejectedCount}
          </strong>
          <span>Không được duyệt</span>
        </button>
      </section>

      <details className="editor-panel" open>
        <summary>+ Tạo đơn nghỉ phép mới</summary>
        <form className="form-grid" onSubmit={create}>
          <label>
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
          <label>
            Loại nghỉ
            <select name="leaveType">
              <option value="ANNUAL">Phép năm</option>
              <option value="SICK">Nghỉ bệnh</option>
              <option value="UNPAID">Không lương</option>
              <option value="OTHER">Khác</option>
            </select>
          </label>
          <label>
            Từ ngày
            <input name="startDate" required type="date" />
          </label>
          <label>
            Đến ngày
            <input name="endDate" required type="date" />
          </label>
          <label className="span-2">
            Lý do xin nghỉ
            <textarea name="reason" placeholder="Nhập lý do cụ thể…" required />
          </label>
          <button className="primary-button form-action">Gửi đơn nghỉ</button>
        </form>
      </details>

      {filteredItems === null ? (
        <LoadingState />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          description="Không tìm thấy đơn nghỉ nào trong mục này."
          title="Chưa có đơn nghỉ"
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Loại nghỉ</th>
                <th>Khoảng thời gian</th>
                <th>Lý do</th>
                <th>Trạng thái</th>
                <th>Thao tác xử lý</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{nameOf(item.employeeId)}</strong>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'var(--canvas-subtle)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      {leaveTypeMap[item.leaveType] ?? item.leaveType}
                    </span>
                  </td>
                  <td>
                    {item.startDate} → {item.endDate}
                  </td>
                  <td>{item.reason}</td>
                  <td>
                    <StatusBadge value={item.status} />
                  </td>
                  <td>
                    {item.status === 'SUBMITTED' ? (
                      <div className="action-group">
                        <button
                          className="table-action success-action"
                          onClick={() => void review(item.id, 'APPROVED')}
                          type="button"
                        >
                          ✓ Duyệt
                        </button>
                        <button
                          className="table-action danger-action"
                          onClick={() => void review(item.id, 'REJECTED')}
                          type="button"
                        >
                          ✕ Từ chối
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                        {item.reviewNote ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
