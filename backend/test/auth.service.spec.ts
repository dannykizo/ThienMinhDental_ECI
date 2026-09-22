import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  AccessTokenService,
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

function createService(options?: {
  user?: UserAccount | null;
  passwordMatches?: boolean;
}): AuthService {
  const users: UserAuthenticationRepository = {
    findByEmail: vi.fn(() => Promise.resolve(options?.user ?? activeAdmin)),
    findById: vi.fn(() => Promise.resolve(options?.user ?? activeAdmin)),
  };
  const passwordHasher: PasswordHasher = {
    hash: vi.fn(() => Promise.resolve('new-hash')),
    compare: vi.fn(() => Promise.resolve(options?.passwordMatches ?? true)),
  };
  const accessTokens: AccessTokenService = {
    sign: vi.fn(() => Promise.resolve('signed-token')),
    verify: vi.fn(() => Promise.resolve({
      sub: activeAdmin.id,
      email: activeAdmin.email,
      roles: activeAdmin.roles,
    })),
  };

  return new AuthService(users, passwordHasher, accessTokens);
}

describe('AuthService', () => {
  it('normalizes email and returns a signed session for valid credentials', async () => {
    const service = createService();

    await expect(
      service.login('  ADMIN@EXAMPLE.TEST ', 'valid-password'),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        email: 'admin@example.test',
        employeeId: 'employee-1',
        displayName: 'Admin Demo',
        roles: [RoleCode.Admin],
      },
    });
  });

  it('uses one generic error for an invalid password', async () => {
    const service = createService({ passwordMatches: false });

    await expect(
      service.login('admin@example.test', 'wrong-password'),
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
    const service = createService({ user: inactiveUser });

    await expect(
      service.login('admin@example.test', 'valid-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
