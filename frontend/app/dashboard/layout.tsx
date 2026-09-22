'use client';

import Image from 'next/image';
import Link from 'next/link';
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
  icon: (props: { className?: string }) => ReactNode;
}

const navigation: NavItem[] = [
  {
    label: 'Tổng quan',
    href: '/dashboard',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Nhân viên',
    href: '/dashboard/employees',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Lịch làm việc',
    href: '/dashboard/schedules',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4" /><path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    label: 'Vị trí văn phòng',
    href: '/dashboard/locations',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    label: 'Chấm công',
    href: '/dashboard/attendance',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: 'Phiếu công tác',
    href: '/dashboard/business-trips',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: 'Đơn nghỉ phép',
    href: '/dashboard/leave',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    ),
  },
  {
    label: 'Thông báo nội bộ',
    href: '/dashboard/announcements',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    label: 'Báo cáo tháng',
    href: '/dashboard/reports',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    label: 'KPI Lite',
    href: '/dashboard/kpi',
    ready: true,
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
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
          !
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
                  <item.icon />
                </span>
                <span>{item.label}</span>
              </Link>
            ) : (
              <div className="nav-item disabled" key={item.label}>
                <span className="nav-icon" aria-hidden="true">
                  <item.icon />
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
            ↗
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="topbar-strip">
          <div className="topbar-left">
            <div className="topbar-branch">
              <span aria-hidden="true">📍</span>
              Phạm vi dữ liệu theo quyền tài khoản
            </div>
            {currentDateString && (
              <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                📅 {currentDateString}
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
