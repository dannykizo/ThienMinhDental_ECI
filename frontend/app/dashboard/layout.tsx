'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Bell,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  getAdminSession,
  logout,
  type RoleCode,
  type SessionUser,
} from '@/lib/auth-api';

interface NavItem {
  label: string;
  href: string;
  ready: boolean;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  {
    label: 'Tổng quan',
    href: '/dashboard',
    ready: true,
    icon: LayoutDashboard,
  },
  {
    label: 'Nhân viên',
    href: '/dashboard/employees',
    ready: true,
    icon: UsersRound,
  },
  {
    label: 'Tài khoản & thiết bị',
    href: '/dashboard/access',
    ready: true,
    icon: ShieldCheck,
  },
  {
    label: 'Lịch làm việc',
    href: '/dashboard/schedules',
    ready: true,
    icon: CalendarDays,
  },
  {
    label: 'Vị trí văn phòng',
    href: '/dashboard/locations',
    ready: true,
    icon: MapPin,
  },
  {
    label: 'Chấm công',
    href: '/dashboard/attendance',
    ready: true,
    icon: Clock3,
  },
  {
    label: 'Phiếu công tác',
    href: '/dashboard/business-trips',
    ready: true,
    icon: BriefcaseBusiness,
  },
  {
    label: 'Đơn nghỉ phép',
    href: '/dashboard/leave',
    ready: true,
    icon: CalendarCheck2,
  },
  {
    label: 'Thông báo nội bộ',
    href: '/dashboard/announcements',
    ready: true,
    icon: Bell,
  },
  {
    label: 'Báo cáo tháng',
    href: '/dashboard/reports',
    ready: true,
    icon: ChartNoAxesCombined,
  },
  {
    label: 'KPI Lite',
    href: '/dashboard/kpi',
    ready: true,
    icon: Gauge,
  },
];

const chiefAccountantRoutes = new Set([
  '/dashboard',
  '/dashboard/employees',
  '/dashboard/attendance',
  '/dashboard/reports',
  '/dashboard/kpi',
]);

const scopedManagerRoutes = new Set([
  '/dashboard',
  '/dashboard/employees',
  '/dashboard/announcements',
]);

function canAccessNavigation(item: NavItem, roles: RoleCode[]): boolean {
  if (roles.includes('ADMIN')) return true;
  if (roles.includes('CHIEF_ACCOUNTANT')) {
    return chiefAccountantRoutes.has(item.href);
  }
  if (roles.includes('AREA_MANAGER') || roles.includes('MANAGER')) {
    return scopedManagerRoutes.has(item.href);
  }
  return false;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [currentDateString] = useState(() => {
    try {
      const now = new Date();
      return new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(now);
    } catch {
      return '';
    }
  });

  const loadSession = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const currentUser = await getAdminSession();
      setUser(currentUser);
      setState('ready');
    } catch (caughtError) {
      if (
        caughtError instanceof ApiError &&
        (caughtError.status === 401 || caughtError.status === 403)
      ) {
        router.replace('/login');
        return;
      }
      setError('Backend API chưa sẵn sàng. Kiểm tra dịch vụ rồi thử lại.');
      setState('error');
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    getAdminSession()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
          setState('ready');
        }
      })
      .catch((caughtError: unknown) => {
        if (!active) return;
        if (
          caughtError instanceof ApiError &&
          (caughtError.status === 401 || caughtError.status === 403)
        ) {
          router.replace('/login');
          return;
        }
        setError('Backend API chưa sẵn sàng. Kiểm tra dịch vụ rồi thử lại.');
        setState('error');
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  if (state === 'loading') {
    return (
      <main className="route-state" aria-busy="true">
        <div className="route-loader" aria-hidden="true" />
        <h1>Đang kiểm tra phiên đăng nhập</h1>
        <p>Admin Web đang kết nối tới Backend API…</p>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="route-state">
        <div className="state-icon state-icon-error" aria-hidden="true">
          <TriangleAlert size={25} strokeWidth={1.9} />
        </div>
        <h1>Chưa thể tải trang quản trị</h1>
        <p>{error}</p>
        <button className="secondary-button" onClick={loadSession} type="button">
          Thử kết nối lại
        </button>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo-card">
            <Image
              alt="Thiên Minh"
              className="sidebar-full-logo"
              height={54}
              priority
              src="/brand/thien-minh-logo.png"
              width={90}
            />
            <Image
              alt=""
              aria-hidden="true"
              className="sidebar-mark-logo"
              height={38}
              src="/brand/thien-minh-mark.png"
              width={42}
            />
          </div>
          <div>
            <strong>Thiên Minh</strong>
            <span>Workforce Admin</span>
          </div>
        </div>

        <nav aria-label="Điều hướng quản trị" className="sidebar-nav">
          <p className="nav-label">QUẢN TRỊ</p>
          {navigation.filter((item) => canAccessNavigation(item, user?.roles ?? [])).map((item) =>
            item.ready ? (
              <Link
                aria-current={pathname === item.href ? 'page' : undefined}
                className={pathname === item.href ? 'nav-item active' : 'nav-item'}
                href={item.href}
                key={item.label}
              >
                <span className="nav-icon" aria-hidden="true">
                  <item.icon size={17} strokeWidth={1.9} />
                </span>
                <span>{item.label}</span>
              </Link>
            ) : (
              <div className="nav-item disabled" key={item.label}>
                <span className="nav-icon" aria-hidden="true">
                  <item.icon size={17} strokeWidth={1.9} />
                </span>
                <span>{item.label}</span>
                <span className="nav-status">SẮP CÓ</span>
              </div>
            ),
          )}
        </nav>

        <div className="sidebar-user">
          <div className="avatar" aria-hidden="true">
            {user?.displayName ? user.displayName.slice(0, 1).toUpperCase() : 'A'}
          </div>
          <div className="user-copy">
            <strong>{user?.displayName ?? 'Quản trị viên'}</strong>
            <span>{user?.email ?? 'admin@thienminh.vn'}</span>
          </div>
          <button
            aria-label="Đăng xuất"
            className="logout-button"
            onClick={handleLogout}
            title="Đăng xuất"
            type="button"
          >
            <LogOut size={17} strokeWidth={1.9} />
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="topbar-strip">
          <div className="topbar-left">
            <div className="topbar-branch">
              <MapPin aria-hidden="true" size={14} strokeWidth={2} />
              Phạm vi dữ liệu theo quyền tài khoản
            </div>
            {currentDateString && (
              <span className="topbar-date">
                <CalendarDays aria-hidden="true" size={14} strokeWidth={2} />
                {currentDateString}
              </span>
            )}
          </div>
          <div className="topbar-right">
            <div className="environment-badge">
              <span />
              DEVELOPMENT
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
