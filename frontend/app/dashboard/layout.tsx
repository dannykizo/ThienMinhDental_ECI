'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Activity,
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
  Menu,
  Network,
  ShieldCheck,
  ShieldAlert,
  TriangleAlert,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  getAdminSession,
  logout,
  type SessionUser,
} from '@/lib/auth-api';

interface NavItem {
  group: 'TỔNG QUAN' | 'NHÂN SỰ' | 'VẬN HÀNH' | 'HỆ THỐNG';
  label: string;
  href: string;
  ready: boolean;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { group: 'VẬN HÀNH', label: 'Xử lý nghỉ phép', href: '/dashboard/leave-workflow', ready: true, icon: Clock3 },
  { group: 'VẬN HÀNH', label: 'Theo dõi phạm vi quản lý', href: '/dashboard/managed-modules', ready: true, icon: Clock3 },
  { group: 'VẬN HÀNH', label: 'Giải trình hai bước', href: '/dashboard/explanations', ready: true, icon: Clock3 },
  {
    group: 'TỔNG QUAN',
    label: 'Tổng quan',
    href: '/dashboard',
    ready: true,
    icon: LayoutDashboard,
  },
  {
    group: 'NHÂN SỰ',
    label: 'Nhân viên',
    href: '/dashboard/employees',
    ready: true,
    icon: UsersRound,
  },
  {
    group: 'HỆ THỐNG',
    label: 'Tài khoản & thiết bị',
    href: '/dashboard/access',
    ready: true,
    icon: ShieldCheck,
  },
  {
    group: 'NHÂN SỰ',
    label: 'Tổ chức & phân quyền',
    href: '/dashboard/organization',
    ready: true,
    icon: Network,
  },
  {
    group: 'NHÂN SỰ',
    label: 'Phạm vi quản lý',
    href: '/dashboard/managed',
    ready: true,
    icon: UsersRound,
  },
  {
    group: 'VẬN HÀNH',
    label: 'Lịch làm việc',
    href: '/dashboard/schedules',
    ready: true,
    icon: CalendarDays,
  },
  {
    group: 'VẬN HÀNH',
    label: 'Vị trí văn phòng',
    href: '/dashboard/locations',
    ready: true,
    icon: MapPin,
  },
  {
    group: 'VẬN HÀNH',
    label: 'Chấm công',
    href: '/dashboard/attendance',
    ready: true,
    icon: Clock3,
  },
  {
    group: 'VẬN HÀNH',
    label: 'Phiếu công tác',
    href: '/dashboard/business-trips',
    ready: true,
    icon: BriefcaseBusiness,
  },
  {
    group: 'NHÂN SỰ',
    label: 'Đơn nghỉ phép',
    href: '/dashboard/leave',
    ready: true,
    icon: CalendarCheck2,
  },
  {
    group: 'NHÂN SỰ',
    label: 'Thông báo nội bộ',
    href: '/dashboard/announcements',
    ready: true,
    icon: Bell,
  },
  {
    group: 'NHÂN SỰ',
    label: 'Kỷ luật nhân sự',
    href: '/dashboard/disciplinary-actions',
    ready: true,
    icon: ShieldAlert,
  },
  {
    group: 'TỔNG QUAN',
    label: 'Báo cáo tháng',
    href: '/dashboard/reports',
    ready: true,
    icon: ChartNoAxesCombined,
  },
  {
    group: 'TỔNG QUAN',
    label: 'KPI Lite',
    href: '/dashboard/kpi',
    ready: true,
    icon: Gauge,
  },
  {
    group: 'HỆ THỐNG',
    label: 'Vận hành hệ thống',
    href: '/dashboard/operations',
    ready: true,
    icon: Activity,
  },
];

const environmentLabel = process.env.NEXT_PUBLIC_APP_ENV?.toUpperCase() || 'DEVELOPMENT';

function canAccessPath(user: SessionUser | null, path: string): boolean {
  const normalized = path.replace(/\/$/, '');
  return user?.portal?.navigation.some((href) => normalized === href || (href !== '/dashboard' && normalized.startsWith(`${href}/`))) ?? false;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const dataScopeLabel = user?.portal?.scopeLabel ?? 'Đang kiểm tra phạm vi';
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
          if (pathname.replace(/\/$/, '') === '/dashboard' && currentUser.portal?.homePath !== '/dashboard') {
            router.replace(currentUser.portal?.homePath ?? '/login');
          }
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
  }, [router, pathname]);

  useEffect(() => {
    let active = true;
    const refreshAccess = () => {
      getAdminSession().then((currentUser) => { if (active) setUser(currentUser); })
        .catch((caught: unknown) => {
          if (!active) return;
          if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) router.replace('/login');
          else { setError('Chưa kiểm tra lại được quyền. Kết nối Backend rồi thử lại.'); setState('error'); }
        });
    };
    window.addEventListener('focus', refreshAccess);
    return () => { active = false; window.removeEventListener('focus', refreshAccess); };
  }, [router]);

  useEffect(() => {
    const handleSessionExpired = () => router.replace('/login');
    window.addEventListener('thien-minh:session-expired', handleSessionExpired);
    return () => window.removeEventListener('thien-minh:session-expired', handleSessionExpired);
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
      {menuOpen && <button aria-label="Đóng menu" className="sidebar-backdrop" onClick={() => setMenuPath(null)} type="button" />}
      <aside className={menuOpen ? 'sidebar mobile-open' : 'sidebar'}>
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
          {(['TỔNG QUAN', 'NHÂN SỰ', 'VẬN HÀNH', 'HỆ THỐNG'] as const).map((group) => {
            const groupItems = navigation.filter((item) => item.group === group && canAccessPath(user, item.href));
            if (groupItems.length === 0) return null;
            return <div className="nav-group" key={group}><p className="nav-label">{group}</p>{groupItems.map((item) => item.ready ? (
              <Link
                aria-current={pathname === item.href ? 'page' : undefined}
                className={pathname === item.href ? 'nav-item active' : 'nav-item'}
                href={item.href}
                key={item.label}
                onClick={() => setMenuPath(null)}
                title={item.label}
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
            ))}</div>;
          })}
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
            <button aria-expanded={menuOpen} aria-label={menuOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'} className="mobile-menu-button" onClick={() => setMenuPath((current) => current === pathname ? null : pathname)} type="button">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
            <div className="topbar-branch">
              <MapPin aria-hidden="true" size={14} strokeWidth={2} />
              {dataScopeLabel}
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
              {environmentLabel}
            </div>
          </div>
        </header>

        {canAccessPath(user, pathname) ? children : (
          <section className="route-state">
            <ShieldAlert aria-hidden="true" size={32} />
            <h1>Trang này nằm ngoài quyền hiện tại</h1>
            <p>Quyền và phạm vi truy cập do Backend kiểm tra. Bạn vẫn có thể dùng khu vực được cấp.</p>
            <Link className="secondary-button" href={user?.portal?.homePath ?? '/login'}>Về khu vực của tôi</Link>
          </section>
        )}
      </main>
    </div>
  );
}
