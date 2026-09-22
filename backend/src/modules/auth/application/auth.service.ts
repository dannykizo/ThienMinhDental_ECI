import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RoleCode } from '../domain/role-code.js';
import type { UserAccount } from '../domain/user-account.js';
import {
  ACCESS_TOKEN_SERVICE,
  AUTH_SESSION_REPOSITORY,
  LOGIN_ALERT_SENDER,
  PASSWORD_HASHER,
  USER_AUTHENTICATION_REPOSITORY,
  type AccessTokenService,
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
  expiresAt: string;
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

    const sessionDays = Number(this.config.get<string>('AUTH_SESSION_DAYS', '30'));
    if (!Number.isFinite(sessionDays) || sessionDays <= 0) {
      throw new Error('AUTH_SESSION_DAYS must be a positive number');
    }
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
    const session = await this.sessions.replaceActiveSession(
      user.id,
      context,
      expiresAt,
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
      expiresAt: expiresAt.toISOString(),
      user: this.toView(user),
    };
  }

  async getAuthenticatedUser(
    id: string,
    sessionId: string,
  ): Promise<AuthenticatedUserView> {
    if (!(await this.sessions.isActive(sessionId, id))) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Phiên đăng nhập đã hết hạn hoặc được đăng xuất từ thiết bị khác.',
      });
    }
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
}
