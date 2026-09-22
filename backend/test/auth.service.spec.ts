import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, type Mock, vi } from 'vitest';
import type {
  AccessTokenService,
  AuthSessionRepository,
  LoginAlertSender,
  LoginContext,
  PasswordHasher,
  UserAuthenticationRepository,
} from '../src/modules/auth/application/auth.ports.js';
import { AuthService } from '../src/modules/auth/application/auth.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { UserAccount } from '../src/modules/auth/domain/user-account.js';

const activeAdmin = new UserAccount({
  id: 'user-1',
  email: 'admin@example.test',
  passwordHash: 'stored-hash',
  isActive: true,
  employeeId: 'employee-1',
  displayName: 'Admin Demo',
  roles: [RoleCode.Admin],
});

interface AuthTestHarness {
  service: AuthService;
  replaceActiveSessionMock: Mock<AuthSessionRepository['replaceActiveSession']>;
  signMock: Mock<AccessTokenService['sign']>;
  isActiveMock: Mock<AuthSessionRepository['isActive']>;
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
      sid: 'session-1',
      email: activeAdmin.email,
      roles: activeAdmin.roles,
    })),
  };
  const replaceActiveSessionMock = vi.fn(() =>
      Promise.resolve({
        id: 'session-1',
        userId: activeAdmin.id,
        deviceId: 'device-1234',
        deviceName: 'Chrome on Windows',
        clientType: 'WEB' as const,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        signedInAt: new Date('2026-09-22T03:00:00.000Z'),
        expiresAt: new Date('2026-10-22T03:00:00.000Z'),
        revokedAt: null,
        revokeReason: null,
        loginAlertStatus: 'PENDING' as const,
        loginAlertSentAt: null,
        loginAlertNote: null,
      }),
    );
  const isActiveMock = vi.fn(() => Promise.resolve(true));
  const sessions: AuthSessionRepository = {
    replaceActiveSession: replaceActiveSessionMock,
    isActive: isActiveMock,
    revoke: vi.fn(() => Promise.resolve(true)),
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
      new ConfigService({ AUTH_SESSION_DAYS: '30' }),
    ),
    replaceActiveSessionMock,
    signMock,
    isActiveMock,
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
  it('normalizes email and returns a signed session for valid credentials', async () => {
    const { service, replaceActiveSessionMock, signMock } = createService();

    await expect(
      service.login('  ADMIN@EXAMPLE.TEST ', 'valid-password', loginContext),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
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
    );
    expect(signMock).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'session-1' }),
    );
  });

  it('uses one generic error for an invalid password', async () => {
    const { service } = createService({ passwordMatches: false });

    await expect(
      service.login('admin@example.test', 'wrong-password', loginContext),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_CREDENTIALS',
      },
    });
  });

  it('rejects an inactive account even when the password matches', async () => {
    const inactiveUser = new UserAccount({
      ...activeAdmin,
      isActive: false,
    });
    const { service } = createService({ user: inactiveUser });

    await expect(
      service.login('admin@example.test', 'valid-password', loginContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token after its server-side session is revoked', async () => {
    const { service, isActiveMock } = createService();
    isActiveMock.mockResolvedValue(false);

    await expect(
      service.getAuthenticatedUser(activeAdmin.id, 'session-1'),
    ).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
  });
});
