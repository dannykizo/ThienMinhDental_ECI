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

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">∅</span>
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

const statusToneMap: Record<string, 'success' | 'warning' | 'danger'> = {
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
  ABSENT: 'danger',
  INACTIVE: 'danger',
};

const statusLabelMap: Record<string, string> = {
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
  ABSENT: 'Vắng mặt',
  INACTIVE: 'Tạm khóa',
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
