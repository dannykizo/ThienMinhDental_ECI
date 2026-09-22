'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ApiError, login } from '@/lib/auth-api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('loading');
    setError('');

    try {
      await login(email, password);
      setState('success');
      router.replace('/dashboard');
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Không thể kết nối Backend API. Vui lòng thử lại.',
      );
      setState('error');
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Giới thiệu hệ thống">
        <div className="login-logo-card">
          <Image
            alt="Thiên Minh Dental"
            height={90}
            priority
            src="/brand/thien-minh-logo.png"
            width={180}
          />
        </div>
        <div>
          <p className="eyebrow" style={{ color: 'var(--brand-accent)' }}>
            THIÊN MINH DENTAL · CHI NHÁNH TP.HCM
          </p>
          <h1>Vận hành nhân sự, rõ ràng từng ngày.</h1>
          <p className="login-intro">
            Không gian quản trị tập trung cho chấm công, điều phối công tác,
            duyệt đơn nghỉ và thông báo nội bộ.
          </p>
        </div>
        <div className="security-note">
          <span aria-hidden="true">✓</span>
          Phiên làm việc được bảo mật an toàn với xác thực JWT HttpOnly.
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-heading">
            <p className="eyebrow">WORKFORCE PORTAL</p>
            <h2>Đăng nhập quản trị</h2>
            <p>Nhập tài khoản được cấp quyền để tiếp tục.</p>
          </div>

          <label className="field">
            <span>Tài khoản / Email</span>
            <input
              autoComplete="username"
              disabled={state === 'loading' || state === 'success'}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@thienminh.vn"
              required
              type="text"
              value={email}
            />
          </label>

          <label className="field">
            <span>Mật khẩu</span>
            <input
              autoComplete="current-password"
              disabled={state === 'loading' || state === 'success'}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </label>

          {state === 'error' && (
            <div className="form-message error-message" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </div>
          )}

          {state === 'success' && (
            <div className="form-message success-message" role="status">
              <span aria-hidden="true">✓</span>
              Đăng nhập thành công. Đang chuyển hướng…
            </div>
          )}

          <button
            className="primary-button"
            disabled={state === 'loading' || state === 'success'}
            type="submit"
          >
            {state === 'loading' ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Đang xác thực…
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>

          <p className="support-copy">
            Thiên Minh Dental Workforce · Số 9A Phạm Cự Lượng, Q. Tân Bình, TP.HCM
          </p>
        </form>
      </section>
    </main>
  );
}
