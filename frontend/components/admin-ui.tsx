'use client';

import { Inbox, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="module-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="module-header-action">{action}</div>}
    </header>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'success' | 'error';
  children: ReactNode;
}) {
  return (
    <div
      className={`notice notice-${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function ToastNotice({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5_000);
    return () => window.clearTimeout(timer);
  }, [children, onDismiss]);
  return <div className="toast-notice" role="status"><span>{children}</span><button aria-label="Đóng thông báo" onClick={onDismiss} type="button"><X size={16} /></button></div>;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">
        <Inbox size={34} strokeWidth={1.6} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function LoadingState(): ReactNode {
  return (
    <div className="module-loading">
      <span className="route-loader" />
      <p>Đang tải dữ liệu…</p>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return <nav aria-label="Phân trang" className="pagination">
    <span>Trang {page}/{pageCount} · {total} kết quả</span>
    <div><button className="secondary-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">Trang trước</button><button className="secondary-button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} type="button">Trang sau</button></div>
  </nav>;
}

const statusToneMap: Record<string, 'success' | 'warning' | 'danger'> = {
  LOCKED: 'success',
  REQUESTED: 'warning',
  OPEN: 'warning',
  CHECKED_IN: 'warning',
  APPROVED: 'success',
  COMPLETED: 'success',
  PUBLISHED: 'success',
  PRESENT: 'success',
  CHECKED_OUT: 'success',
  ACTIVE: 'success',
  SUBMITTED: 'warning',
  ASSIGNED: 'warning',
  IN_PROGRESS: 'warning',
  PENDING: 'warning',
  LATE: 'warning',
  REJECTED: 'danger',
  CANCELLED: 'danger',
  WITHDRAWN: 'danger',
  ABSENT: 'danger',
  INACTIVE: 'danger',
  ISSUED: 'success',
  REVOKED: 'danger',
  DRAFT: 'warning',
  PARTIAL_LEAVE: 'warning',
  INCOMPLETE: 'warning',
  FAILED: 'danger',
  SENT: 'success',
  SKIPPED: 'warning',
};

const statusLabelMap: Record<string, string> = {
  LOCKED: 'Đã chốt',
  REQUESTED: 'Chờ giải trình',
  OPEN: 'Đang mở',
  CHECKED_IN: 'Đã vào ca',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn thành',
  PUBLISHED: 'Đã đăng',
  PRESENT: 'Có mặt',
  CHECKED_OUT: 'Đã ra về',
  ACTIVE: 'Hoạt động',
  SUBMITTED: 'Chờ duyệt',
  ASSIGNED: 'Đã giao việc',
  IN_PROGRESS: 'Đang thực hiện',
  PENDING: 'Đang xử lý',
  LATE: 'Đi muộn',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  WITHDRAWN: 'Đã thu hồi',
  ABSENT: 'Vắng mặt',
  INACTIVE: 'Tạm khóa',
  ISSUED: 'Đã ban hành',
  REVOKED: 'Đã thu hồi',
  DRAFT: 'Bản nháp',
  PARTIAL_LEAVE: 'Nghỉ một phần',
  INCOMPLETE: 'Thiếu chấm công',
  FAILED: 'Thất bại',
  SENT: 'Đã gửi',
  SKIPPED: 'Chưa gửi',
  BUSINESS_TRIP: 'Công tác',
  LEAVE: 'Nghỉ phép',
};

export function StatusBadge({ value }: { value: string }) {
  const tone = statusToneMap[value] ?? 'warning';
  const label = statusLabelMap[value] ?? value;
  return <span className={`status-badge status-${tone}`}>{label}</span>;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle:
        value.includes('T') || value.includes(':') ? 'short' : undefined,
    }).format(new Date(value));
  } catch {
    return value;
  }
}
