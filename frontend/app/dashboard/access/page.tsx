'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
          <h1>Tài khoản & thiết bị</h1>
          <p>
            Theo dõi lịch sử đăng nhập, trạng thái cảnh báo email và thu hồi
            thiết bị khi nhân viên đổi hoặc mất máy.
          </p>
        </div>
      </header>

      <div className="notice notice-info">
        Mỗi tài khoản chỉ có một phiên hoạt động. Đăng nhập trên thiết bị mới sẽ
        tự động đăng xuất thiết bị cũ; phiên hợp lệ tối đa 30 ngày.
      </div>

      {message && state !== 'error' && (
        <div className="notice notice-success">{message}</div>
      )}

      <div className="metric-grid">
        <article className="metric-card">
          <p>Phiên đang hoạt động</p>
          <strong>{metrics.active}</strong>
          <span>Được Backend xác thực theo từng request</span>
        </article>
        <article className="metric-card">
          <p>Lượt đăng nhập Mobile</p>
          <strong>{metrics.mobile}</strong>
          <span>Trong 200 bản ghi gần nhất</span>
        </article>
        <article className="metric-card">
          <p>Email cảnh báo đã gửi</p>
          <strong>{metrics.alerts}</strong>
          <span>SMTP phải được cấu hình trên Backend</span>
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
          <span aria-hidden="true">!</span>
          <h3>Không thể tải dữ liệu</h3>
          <p>{message}</p>
          <button className="secondary-button" onClick={() => void load()} type="button">
            Thử lại
          </button>
        </div>
      )}

      {state === 'ready' && sessions.length === 0 && (
        <div className="empty-state">
          <span aria-hidden="true">◇</span>
          <h3>Chưa có lịch sử đăng nhập</h3>
          <p>Dữ liệu sẽ xuất hiện từ lần đăng nhập tiếp theo.</p>
        </div>
      )}

      {state === 'ready' && sessions.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Thiết bị</th>
                <th>Đăng nhập</th>
                <th>Phiên</th>
                <th>Cảnh báo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>
                    <strong>{session.displayName}</strong>
                    <br />
                    <small>{session.accountEmail}</small>
                  </td>
                  <td>
                    {session.deviceName}
                    <br />
                    <small>
                      {session.clientType} · {session.ipAddress ?? 'Không rõ IP'}
                    </small>
                  </td>
                  <td>{dateFormatter.format(new Date(session.signedInAt))}</td>
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
                      <>
                        <br />
                        <small>Phiên hiện tại</small>
                      </>
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
                        className="table-action danger-action"
                        disabled={revokingId === session.id}
                        onClick={() => void revoke(session)}
                        type="button"
                      >
                        {revokingId === session.id
                          ? 'Đang thu hồi…'
                          : 'Đăng xuất thiết bị'}
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
