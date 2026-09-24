import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RoleCode } from '../domain/role-code.js';
import {
  createRefreshSecret,
  formatRefreshToken,
  hashRefreshSecret,
  matchesRefreshSecret,
  parseRefreshToken,
} from '../domain/refresh-token.js';
import type { UserAccount } from '../domain/user-account.js';
import {
  ACCESS_TOKEN_SERVICE,
  AUTH_SESSION_REPOSITORY,
  LOGIN_ALERT_SENDER,
  PASSWORD_HASHER,
  USER_AUTHENTICATION_REPOSITORY,
  type AccessTokenService,
  type AuthSessionRecord,
  type AuthSessionRepository,
  type LoginAlertSender,
  type LoginContext,
  type PasswordHasher,
  type UserAuthenticationRepository,
} from './auth.ports.js';

export interface AuthenticatedUserView {
  id: string;
  email: string;
  employeeId: string | null;
  displayName: string;
  roles: RoleCode[];
}

export interface LoginResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  clientType: 'WEB' | 'MOBILE';
  refreshToken: string;
  sessionExpiresAt: string;
  user: AuthenticatedUserView;
}

export interface SessionAuditView {
  id: string;
  accountEmail: string;
  displayName: string;
  deviceName: string;
  clientType: 'WEB' | 'MOBILE';
  ipAddress: string | null;
  signedInAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  loginAlertStatus: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
  loginAlertNote: string | null;
  isCurrent: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_AUTHENTICATION_REPOSITORY)
    private readonly users: UserAuthenticationRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokens: AccessTokenService,
    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly sessions: AuthSessionRepository,
    @Inject(LOGIN_ALERT_SENDER)
    private readonly loginAlerts: LoginAlertSender,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    context: LoginContext,
  ): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);

    if (
      !user ||
      !user.isActive ||
      !(await this.passwordHasher.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Tài khoản hoặc mật khẩu không đúng.',
      });
    }

    const expiresAt = new Date(
      Date.now() + this.sessionLifetimeMs(context.clientType),
    );
    const refreshSecret = createRefreshSecret();
    const session = await this.sessions.replaceActiveSession(
      user.id,
      context,
      expiresAt,
      hashRefreshSecret(refreshSecret),
    );
    const accessToken = await this.accessTokens.sign({
      sub: user.id,
      sid: session.id,
      email: user.email,
      roles: user.roles,
    });

    try {
      const alert = await this.loginAlerts.send({
        accountEmail: user.email,
        displayName: user.displayName,
        deviceName: session.deviceName,
        clientType: session.clientType,
        ipAddress: session.ipAddress,
        signedInAt: session.signedInAt,
      });
      await this.sessions.markLoginAlert(session.id, alert.status, alert.note);
    } catch {
      await this.sessions.markLoginAlert(
        session.id,
        'FAILED',
        'SMTP_DELIVERY_FAILED',
      );
    }

    return {
      accessToken,
      accessTokenExpiresAt: this.accessTokenExpiresAt().toISOString(),
      clientType: context.clientType,
      refreshToken: formatRefreshToken(session.id, refreshSecret),
      sessionExpiresAt: expiresAt.toISOString(),
      user: this.toView(user),
    };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw this.invalidRefreshToken();

    const session = await this.sessions.findActive(parsed.sessionId);
    if (!session?.refreshTokenHash) throw this.invalidRefreshToken();

    if (
      session.previousRefreshTokenHash &&
      matchesRefreshSecret(parsed.secret, session.previousRefreshTokenHash)
    ) {
      await this.sessions.revoke(session.id, 'REFRESH_TOKEN_REUSE');
      throw this.invalidRefreshToken();
    }
    if (!matchesRefreshSecret(parsed.secret, session.refreshTokenHash)) {
      throw this.invalidRefreshToken();
    }
    await this.ensureSessionIdlePolicy(session);

    const nextSecret = createRefreshSecret();
    const rotated = await this.sessions.rotateRefreshToken(
      session.id,
      session.refreshTokenHash,
      hashRefreshSecret(nextSecret),
    );
    if (!rotated) {
      await this.sessions.revoke(session.id, 'REFRESH_TOKEN_REUSE');
      throw this.invalidRefreshToken();
    }

    const user = await this.users.findById(session.userId);
    if (!user?.isActive) {
      await this.sessions.revoke(session.id, 'SESSION_USER_UNAVAILABLE');
      throw this.invalidRefreshToken();
    }
    const accessToken = await this.accessTokens.sign({
      sub: user.id,
      sid: session.id,
      email: user.email,
      roles: user.roles,
    });
    return {
      accessToken,
      accessTokenExpiresAt: this.accessTokenExpiresAt().toISOString(),
      clientType: session.clientType,
      refreshToken: formatRefreshToken(session.id, nextSecret),
      sessionExpiresAt: session.expiresAt.toISOString(),
      user: this.toView(user),
    };
  }

  async getAuthenticatedUser(
    id: string,
    sessionId: string,
  ): Promise<AuthenticatedUserView> {
    const session = await this.sessions.findActive(sessionId, id);
    if (!session) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Phiên đăng nhập đã hết hạn hoặc được đăng xuất từ thiết bị khác.',
      });
    }
    await this.ensureSessionIdlePolicy(session);
    await this.sessions.touch(session.id);
    const user = await this.users.findById(id);

    if (!user?.isActive) {
      throw new UnauthorizedException({
        code: 'SESSION_USER_UNAVAILABLE',
        message: 'Phiên đăng nhập không còn hợp lệ.',
      });
    }

    return this.toView(user);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, 'USER_LOGOUT');
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, 'ADMIN_REVOKED');
  }

  async listSessions(currentSessionId: string): Promise<SessionAuditView[]> {
    const now = Date.now();
    return (await this.sessions.listAll(200)).map((session) => ({
      id: session.id,
      accountEmail: session.accountEmail,
      displayName: session.displayName,
      deviceName: session.deviceName,
      clientType: session.clientType,
      ipAddress: session.ipAddress,
      signedInAt: session.signedInAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      revokeReason: session.revokeReason,
      status: session.revokedAt
        ? 'REVOKED'
        : session.expiresAt.getTime() <= now
          ? 'EXPIRED'
          : 'ACTIVE',
      loginAlertStatus: session.loginAlertStatus,
      loginAlertNote: session.loginAlertNote,
      isCurrent: session.id === currentSessionId,
    }));
  }

  private toView(user: UserAccount): AuthenticatedUserView {
    return {
      id: user.id,
      email: user.email,
      employeeId: user.employeeId,
      displayName: user.displayName,
      roles: [...user.roles],
    };
  }

  private accessTokenExpiresAt(): Date {
    const minutes = this.positiveNumber('AUTH_ACCESS_TOKEN_MINUTES', 15);
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private sessionLifetimeMs(clientType: 'WEB' | 'MOBILE'): number {
    if (clientType === 'WEB') {
      return this.positiveNumber('AUTH_WEB_SESSION_HOURS', 24) * 60 * 60 * 1000;
    }
    return this.positiveNumber('AUTH_MOBILE_SESSION_DAYS', 30) * 24 * 60 * 60 * 1000;
  }

  private async ensureSessionIdlePolicy(
    session: AuthSessionRecord,
  ): Promise<void> {
    if (session.clientType !== 'WEB') return;
    const idleMinutes = this.positiveNumber('AUTH_WEB_IDLE_MINUTES', 30);
    if (session.lastSeenAt.getTime() > Date.now() - idleMinutes * 60 * 1000) {
      return;
    }
    await this.sessions.revoke(session.id, 'IDLE_TIMEOUT');
    throw new UnauthorizedException({
      code: 'SESSION_IDLE_TIMEOUT',
      message: 'Phiên quản trị đã hết hạn do không hoạt động.',
    });
  }

  private positiveNumber(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key, String(fallback)));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${key} must be a positive number`);
    }
    return value;
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'REFRESH_TOKEN_INVALID',
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    });
  }
}
