'use client';

import {
  CircleAlert,
  History,
  Laptop,
  MailCheck,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ToastNotice } from '@/components/admin-ui';
import { AttendanceDevices } from '@/components/attendance-devices';
import {
  ApiError,
  getLoginSessions,
  type LoginSessionAudit,
  revokeLoginSession,
} from '@/lib/auth-api';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

const statusLabel: Record<LoginSessionAudit['status'], string> = {
  ACTIVE: 'Đang hoạt động',
  EXPIRED: 'Hết hạn',
  REVOKED: 'Đã đăng xuất',
};

const alertLabel: Record<LoginSessionAudit['loginAlertStatus'], string> = {
  PENDING: 'Đang gửi',
  SENT: 'Đã gửi email',
  SKIPPED: 'Chưa cấu hình email',
  FAILED: 'Gửi email lỗi',
};

export default function AccessPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<LoginSessionAudit[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setMessage('');
    try {
      setSessions(await getLoginSessions());
      setState('ready');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Không thể tải lịch sử đăng nhập.',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    getLoginSessions()
      .then((result) => {
        if (!active) return;
        setSessions(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'Không thể tải lịch sử đăng nhập.',
        );
        setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(
    () => ({
      active: sessions.filter((session) => session.status === 'ACTIVE').length,
      mobile: sessions.filter((session) => session.clientType === 'MOBILE').length,
      alerts: sessions.filter((session) => session.loginAlertStatus === 'SENT').length,
    }),
    [sessions],
  );

  async function revoke(session: LoginSessionAudit) {
    setRevokingId(session.id);
    setMessage('');
    try {
      await revokeLoginSession(session.id);
      if (session.isCurrent) {
        router.replace('/login');
        router.refresh();
        return;
      }
      await load();
      setMessage(`Đã đăng xuất thiết bị của ${session.displayName}.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Không thể thu hồi phiên.',
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="module-page">
      <header className="module-header">
        <div>
          <p className="eyebrow">BẢO MẬT TÀI KHOẢN</p>
          <h1>Tài khoản & Thiết bị truy cập</h1>
          <p>
            Theo dõi phiên đăng nhập bảo mật, trạng thái cảnh báo email và thu hồi
            thiết bị khi nhân viên đổi hoặc mất máy.
          </p>
        </div>
      </header>

      <div className="notice notice-info">
        Trưởng phòng/Leader có quyền còn hiệu lực dùng một phiên Web và một thiết bị Mobile đồng thời;
        đăng nhập lại cùng kênh thay phiên cũ. Nhân viên thường vẫn chỉ một phiên.
        Web tối đa 24 giờ, hết phiên sau 30 phút không hoạt động; Mobile tối đa 30 ngày.
      </div>

      {message && state !== 'error' && <ToastNotice onDismiss={() => setMessage('')}>{message}</ToastNotice>}

      {/* KPI Security Metrics */}
      <div className="cfg-metric-grid">
        <article className="cfg-metric-tile">
          <div className="cfg-metric-tile-header">
            <span className="cfg-metric-tile-label">Phiên đang hoạt động</span>
            <span className="cfg-metric-tile-icon cfg-icon-purple">
              <ShieldCheck size={18} />
            </span>
          </div>
          <p className="cfg-metric-tile-value tabular-nums">{metrics.active}</p>
          <span className="cfg-metric-tile-sub">Xác thực token theo từng API request</span>
        </article>

        <article className="cfg-metric-tile">
          <div className="cfg-metric-tile-header">
            <span className="cfg-metric-tile-label">Đăng nhập Mobile App</span>
            <span className="cfg-metric-tile-icon cfg-icon-teal">
              <Smartphone size={18} />
            </span>
          </div>
          <p className="cfg-metric-tile-value tabular-nums">{metrics.mobile}</p>
          <span className="cfg-metric-tile-sub">Trong 200 bản ghi phiên gần nhất</span>
        </article>

        <article className="cfg-metric-tile">
          <div className="cfg-metric-tile-header">
            <span className="cfg-metric-tile-label">Email cảnh báo bảo mật</span>
            <span className="cfg-metric-tile-icon cfg-icon-amber">
              <MailCheck size={18} />
            </span>
          </div>
          <p className="cfg-metric-tile-value tabular-nums">{metrics.alerts}</p>
          <span className="cfg-metric-tile-sub">Đã gửi thông báo đến hòm thư nhân sự</span>
        </article>
      </div>

      {state === 'loading' && (
        <div className="module-loading" aria-busy="true">
          <div className="route-loader" aria-hidden="true" />
          <p>Đang tải lịch sử đăng nhập…</p>
        </div>
      )}

      {state === 'error' && (
        <div className="empty-state">
          <span aria-hidden="true">
            <CircleAlert size={34} strokeWidth={1.6} />
          </span>
          <h3>Không thể tải dữ liệu</h3>
          <p>{message}</p>
          <button className="secondary-button btn-tactile" onClick={() => void load()} type="button">
            Thử lại
          </button>
        </div>
      )}

      {state === 'ready' && sessions.length === 0 && (
        <div className="empty-state">
          <span aria-hidden="true">
            <History size={34} strokeWidth={1.6} />
          </span>
          <h3>Chưa có lịch sử đăng nhập</h3>
          <p>Dữ liệu sẽ xuất hiện từ lần đăng nhập tiếp theo.</p>
        </div>
      )}

      {state === 'ready' && sessions.length > 0 && (
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Thiết bị & Kênh</th>
                <th>Thời điểm đăng nhập</th>
                <th>Trạng thái phiên</th>
                <th>Cảnh báo email</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className={session.isCurrent ? 'cfg-current-session-row' : ''}
                >
                  <td>
                    <strong>{session.displayName}</strong>
                    <br />
                    <small style={{ color: 'var(--muted)' }}>{session.accountEmail}</small>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {session.clientType === 'MOBILE' ? (
                        <Smartphone size={16} color="var(--brand-primary)" />
                      ) : (
                        <Laptop size={16} color="var(--ink-secondary)" />
                      )}
                      <div>
                        <strong>{session.deviceName}</strong>
                        <br />
                        <small style={{ color: 'var(--muted)' }}>
                          {session.clientType} · {session.ipAddress ?? 'Không rõ IP'}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className="tabular-nums">
                    {dateFormatter.format(new Date(session.signedInAt))}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        session.status === 'ACTIVE'
                          ? 'status-success'
                          : 'status-warning'
                      }`}
                    >
                      {statusLabel[session.status]}
                    </span>
                    {session.isCurrent && (
                      <div>
                        <span className="cfg-current-badge">
                          <span className="cfg-pulse-dot" />
                          Phiên hiện tại
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        session.loginAlertStatus === 'SENT'
                          ? 'status-success'
                          : session.loginAlertStatus === 'FAILED'
                            ? 'status-danger'
                            : 'status-warning'
                      }`}
                    >
                      {alertLabel[session.loginAlertStatus]}
                    </span>
                  </td>
                  <td>
                    {session.status === 'ACTIVE' ? (
                      <button
                        className="table-action danger-action btn-tactile"
                        disabled={revokingId === session.id}
                        onClick={() => void revoke(session)}
                        type="button"
                      >
                        {revokingId === session.id
                          ? 'Đang thu hồi…'
                          : 'Đăng xuất thiết bị'}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--muted-light)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Danh sách thiết bị đăng ký điểm danh */}
      <AttendanceDevices />
    </section>
  );
}

