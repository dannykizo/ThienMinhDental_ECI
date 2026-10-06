import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, type Mock, vi } from 'vitest';
import type {
  AccessTokenService,
  AuthSessionRecord,
  AuthSessionRepository,
  LoginAlertSender,
  LoginContext,
  PasswordHasher,
  UserAuthenticationRepository,
} from '../src/modules/auth/application/auth.ports.js';
import { AuthService } from '../src/modules/auth/application/auth.service.js';
import {
  formatRefreshToken,
  hashRefreshSecret,
} from '../src/modules/auth/domain/refresh-token.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { portalAccess } from '../src/modules/auth/domain/portal-access.js';
import { UserAccount } from '../src/modules/auth/domain/user-account.js';

const sessionId = '11111111-1111-4111-8111-111111111111';
const refreshSecret = 'a'.repeat(43);
const activeAdmin = new UserAccount({
  id: 'user-1',
  email: 'admin@example.test',
  passwordHash: 'stored-hash',
  isActive: true,
  employeeId: 'employee-1',
  displayName: 'Admin Demo',
  roles: [RoleCode.Admin],
});

const activeSession: AuthSessionRecord = {
  id: sessionId,
  userId: activeAdmin.id,
  deviceId: 'device-1234',
  deviceName: 'Chrome on Windows',
  clientType: 'WEB',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  signedInAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  lastSeenAt: new Date(),
  refreshTokenHash: hashRefreshSecret(refreshSecret),
  previousRefreshTokenHash: null,
  revokedAt: null,
  revokeReason: null,
  loginAlertStatus: 'PENDING',
  loginAlertSentAt: null,
  loginAlertNote: null,
};

interface AuthTestHarness {
  service: AuthService;
  replaceActiveSessionMock: Mock<AuthSessionRepository['replaceActiveSession']>;
  signMock: Mock<AccessTokenService['sign']>;
  findActiveMock: Mock<AuthSessionRepository['findActive']>;
  rotateRefreshTokenMock: Mock<AuthSessionRepository['rotateRefreshToken']>;
  getPortalAccessMock: Mock<AuthSessionRepository['getPortalAccess']>;
  revokeMock: Mock<AuthSessionRepository['revoke']>;
}

function createService(options?: {
  user?: UserAccount | null;
  passwordMatches?: boolean;
}): AuthTestHarness {
  const users: UserAuthenticationRepository = {
    findByEmail: vi.fn(() => Promise.resolve(options?.user ?? activeAdmin)),
    findById: vi.fn(() => Promise.resolve(options?.user ?? activeAdmin)),
  };
  const passwordHasher: PasswordHasher = {
    hash: vi.fn(() => Promise.resolve('new-hash')),
    compare: vi.fn(() => Promise.resolve(options?.passwordMatches ?? true)),
  };
  const signMock = vi.fn(() => Promise.resolve('signed-token'));
  const accessTokens: AccessTokenService = {
    sign: signMock,
    verify: vi.fn(() => Promise.resolve({
      sub: activeAdmin.id,
      sid: sessionId,
      email: activeAdmin.email,
      roles: activeAdmin.roles,
    })),
  };
  const replaceActiveSessionMock = vi.fn(() => Promise.resolve(activeSession));
  const findActiveMock = vi.fn(() => Promise.resolve(activeSession));
  const rotateRefreshTokenMock = vi.fn(() => Promise.resolve(true));
  const getPortalAccessMock = vi.fn(() => Promise.resolve(portalAccess((options?.user ?? activeAdmin).roles, [], new Date())));
  const revokeMock = vi.fn(() => Promise.resolve(true));
  const sessions: AuthSessionRepository = {
    getPortalAccess: getPortalAccessMock,
    replaceActiveSession: replaceActiveSessionMock,
    findActive: findActiveMock,
    rotateRefreshToken: rotateRefreshTokenMock,
    touch: vi.fn(() => Promise.resolve()),
    revoke: revokeMock,
    listAll: vi.fn(() => Promise.resolve([])),
    markLoginAlert: vi.fn(() => Promise.resolve()),
  };
  const loginAlerts: LoginAlertSender = {
    send: vi.fn(() => Promise.resolve({
      status: 'SKIPPED' as const,
      note: 'SMTP_NOT_CONFIGURED',
    })),
  };

  return {
    service: new AuthService(
      users,
      passwordHasher,
      accessTokens,
      sessions,
      loginAlerts,
      new ConfigService({
        AUTH_ACCESS_TOKEN_MINUTES: '15',
        AUTH_WEB_SESSION_HOURS: '24',
        AUTH_WEB_IDLE_MINUTES: '30',
        AUTH_MOBILE_SESSION_DAYS: '30',
      }),
    ),
    replaceActiveSessionMock,
    signMock,
    findActiveMock,
    rotateRefreshTokenMock,
    getPortalAccessMock,
    revokeMock,
  };
}

const loginContext: LoginContext = {
  clientType: 'WEB',
  deviceId: 'device-1234',
  deviceName: 'Chrome on Windows',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
};

describe('AuthService', () => {
  it('normalizes email and returns access plus refresh credentials', async () => {
    const { service, replaceActiveSessionMock, signMock } = createService();

    await expect(
      service.login('  ADMIN@EXAMPLE.TEST ', 'valid-password', loginContext),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      clientType: 'WEB',
      user: {
        id: 'user-1',
        email: 'admin@example.test',
        employeeId: 'employee-1',
        displayName: 'Admin Demo',
        roles: [RoleCode.Admin],
      },
    });
    expect(replaceActiveSessionMock).toHaveBeenCalledWith(
      activeAdmin.id,
      loginContext,
      expect.any(Date),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(signMock).toHaveBeenCalledWith(
      expect.objectContaining({ sid: sessionId }),
    );
  });

  it('rotates a valid refresh token and signs a new access token', async () => {
    const { service, rotateRefreshTokenMock } = createService();
    const result = await service.refresh(
      formatRefreshToken(sessionId, refreshSecret),
    );

    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).not.toBe(
      formatRefreshToken(sessionId, refreshSecret),
    );
    expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
      sessionId,
      hashRefreshSecret(refreshSecret),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('uses one generic error for an invalid password', async () => {
    const { service } = createService({ passwordMatches: false });
    await expect(
      service.login('admin@example.test', 'wrong-password', loginContext),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('rejects an inactive account even when the password matches', async () => {
    const inactiveUser = new UserAccount({ ...activeAdmin, isActive: false });
    const { service } = createService({ user: inactiveUser });
    await expect(
      service.login('admin@example.test', 'valid-password', loginContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token after its server-side session is revoked', async () => {
    const { service, findActiveMock } = createService();
    findActiveMock.mockResolvedValue(null);
    await expect(
      service.getAuthenticatedUser(activeAdmin.id, sessionId),
    ).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
  });

  it('checks current portal access instead of a stale user snapshot', async () => {
    const { service, getPortalAccessMock } = createService();
    getPortalAccessMock.mockResolvedValue(portalAccess([RoleCode.Employee], [], new Date()));
    await expect(service.adminSession({ ...activeAdmin })).rejects.toMatchObject({ response: { code: 'WEB_ACCESS_DENIED' } });
  });

  it('does not revoke a counterpart channel on logout or admin session revocation', async () => {
    const { service, revokeMock } = createService();
    await service.logout('web-sid');
    await service.revokeSession('mobile-sid');
    expect(revokeMock.mock.calls).toEqual([['web-sid', 'USER_LOGOUT'], ['mobile-sid', 'ADMIN_REVOKED']]);
  });

  it('refresh preserves the absolute lifetime rather than granting another 30 days', async () => {
    const { service, findActiveMock } = createService();
    findActiveMock.mockResolvedValue({ ...activeSession, clientType: 'MOBILE' });
    const result = await service.refresh(formatRefreshToken(sessionId, refreshSecret));
    expect(result.sessionExpiresAt).toBe(activeSession.expiresAt.toISOString());
  });

  it('preserves the Web 24-hour and Mobile 30-day login lifetimes', async () => {
    const { service } = createService();
    for (const [clientType, lifetime] of [['WEB', 24 * 60 * 60 * 1000], ['MOBILE', 30 * 24 * 60 * 60 * 1000]] as const) {
      const before = Date.now();
      const result = await service.login(activeAdmin.email, 'valid-password', { ...loginContext, clientType });
      expect(Date.parse(result.sessionExpiresAt)).toBeGreaterThanOrEqual(before + lifetime);
      expect(Date.parse(result.sessionExpiresAt)).toBeLessThanOrEqual(Date.now() + lifetime);
    }
  });

  it('Web idle timeout revokes only that SID and does not apply to Mobile', async () => {
    const { service, findActiveMock, revokeMock } = createService();
    const idle = new Date(Date.now() - 31 * 60 * 1000);
    findActiveMock.mockResolvedValue({ ...activeSession, lastSeenAt: idle });
    await expect(service.getAuthenticatedUser(activeAdmin.id, sessionId)).rejects.toMatchObject({ response: { code: 'SESSION_IDLE_TIMEOUT' } });
    expect(revokeMock).toHaveBeenCalledWith(sessionId, 'IDLE_TIMEOUT');
    findActiveMock.mockResolvedValue({ ...activeSession, id: 'mobile-session', clientType: 'MOBILE', lastSeenAt: idle });
    await expect(service.getAuthenticatedUser(activeAdmin.id, 'mobile-session')).resolves.toMatchObject({ id: activeAdmin.id });
    expect(revokeMock).toHaveBeenCalledTimes(1);
  });

  it('rejects refresh immediately when the persistence access check retires the Web session', async () => {
    const { service, findActiveMock, rotateRefreshTokenMock } = createService();
    findActiveMock.mockResolvedValue(null);
    await expect(service.refresh(formatRefreshToken(sessionId, refreshSecret))).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_INVALID' } });
    expect(rotateRefreshTokenMock).not.toHaveBeenCalled();
  });
});
