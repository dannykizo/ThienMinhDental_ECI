'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  CarFront,
  CircleCheckBig,
  ClipboardPenLine,
  Clock3,
  Megaphone,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadingState, Notice, PageHeader } from '@/components/admin-ui';
import { apiRequest } from '@/lib/auth-api';

interface DashboardSummary {
  activeEmployees: number;
  attendanceToday: number;
  reviewRequired: number;
  activeTrips: number;
  pendingLeave: number;
  publishedAnnouncements: number;
}

const metrics: Array<{
  key: keyof DashboardSummary;
  label: string;
  note: string;
  icon: LucideIcon;
  href: string;
}> = [
  {
    key: 'activeEmployees',
    label: 'Nhân viên hoạt động',
    note: 'Hồ sơ đang sử dụng',
    icon: UsersRound,
    href: '/dashboard/employees',
  },
  {
    key: 'attendanceToday',
    label: 'Đã ghi nhận hôm nay',
    note: 'Có ít nhất một sự kiện chấm công',
    icon: Clock3,
    href: '/dashboard/attendance',
  },
  {
    key: 'reviewRequired',
    label: 'Cần đối soát & điều chỉnh',
    note: 'Sự kiện có cảnh báo / bất thường',
    icon: TriangleAlert,
    href: '/dashboard/attendance',
  },
  {
    key: 'activeTrips',
    label: 'Công tác đang mở',
    note: 'Đã giao việc hoặc đang thực hiện',
    icon: CarFront,
    href: '/dashboard/business-trips',
  },
  {
    key: 'pendingLeave',
    label: 'Đơn nghỉ chờ duyệt',
    note: 'Cần quản lý xem xét và phê duyệt',
    icon: ClipboardPenLine,
    href: '/dashboard/leave',
  },
  {
    key: 'publishedAnnouncements',
    label: 'Thông báo nội bộ',
    note: 'Nội dung đang phát hành',
    icon: Megaphone,
    href: '/dashboard/announcements',
  },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const priorityItems = summary ? [
    { count: summary.reviewRequired, href: '/dashboard/attendance', label: 'Bản ghi chấm công cần đối soát' },
    { count: summary.pendingLeave, href: '/dashboard/leave', label: 'Đơn nghỉ phép đang chờ duyệt' },
    { count: summary.activeTrips, href: '/dashboard/business-trips', label: 'Phiếu công tác đang mở' },
  ].filter((item) => item.count > 0) : [];

  useEffect(() => {
    apiRequest<DashboardSummary>('/reporting/dashboard')
      .then(setSummary)
      .catch(() => setError('Không thể tải số liệu tổng quan.'));
  }, []);

  return (
    <div className="dashboard-page module-page">
      <PageHeader
        description="Tổng quan tình hình vận hành nhân sự và chấm công tại Chi nhánh TP.HCM."
        eyebrow="TRUNG TÂM QUẢN TRỊ"
        title="Tổng quan vận hành"
      />

      {error && <Notice kind="error">{error}</Notice>}

      {!summary ? (
        <LoadingState />
      ) : (
        <>
          <section aria-label="Chỉ số tổng quan" className="metric-grid">
            {metrics.map((metric) => (
              <Link
                className="metric-card"
                href={metric.href}
                key={metric.key}
                style={{ textDecoration: 'none' }}
              >
                <div className="metric-card-top">
                  <p>{metric.label}</p>
                  <metric.icon
                    aria-hidden="true"
                    className="metric-card-icon"
                    size={20}
                    strokeWidth={1.9}
                  />
                </div>
                <strong>{summary[metric.key]}</strong>
                <span>{metric.note}</span>
              </Link>
            ))}
          </section>

          <section className="priority-panel" aria-labelledby="priority-heading">
            <div className="priority-heading">
              <div><p className="eyebrow">HÀNG ĐỢI ƯU TIÊN</p><h2 id="priority-heading">Việc cần xử lý</h2></div>
              <span>{priorityItems.length > 0 ? `${priorityItems.length} nhóm công việc` : 'Không có tồn đọng'}</span>
            </div>
            {priorityItems.length > 0 ? <div className="priority-list">{priorityItems.map((item) => <Link href={item.href} key={item.href}><span><strong>{item.count}</strong>{item.label}</span><ArrowUpRight aria-hidden="true" size={18} /></Link>)}</div> : <div className="priority-clear"><CircleCheckBig aria-hidden="true" size={22} /><span><strong>Hàng đợi đã sạch</strong><small>Chưa có hồ sơ nghiệp vụ cần xử lý ngay.</small></span></div>}
          </section>

          <section className="foundation-hero">
            <div>
              <p className="hero-kicker">THIÊN MINH DENTAL WORKFORCE</p>
              <h2>Hệ thống vận hành nhân sự chuẩn hóa</h2>
              <p>
                Quản lý phân ca, chấm công vị trí geofence chi nhánh, điều phối
                công tác kỹ thuật và đối soát bảng công cuối tháng một cách minh
                bạch, chính xác.
              </p>
            </div>
            <div className="foundation-seal">
              <Image
                alt=""
                aria-hidden="true"
                height={52}
                src="/brand/thien-minh-mark.png"
                width={58}
              />
              <strong>ACTIVE</strong>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
