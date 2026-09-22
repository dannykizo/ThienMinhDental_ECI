import {
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedRequest } from '../src/modules/auth/presentation/auth-request.js';
import { RolesGuard } from '../src/modules/auth/presentation/roles.guard.js';

function createContext(roles: RoleCode[]): ExecutionContext {
  const request = {
    user: {
      id: 'user-1',
      email: 'user@example.test',
      employeeId: 'employee-1',
      displayName: 'Demo User',
      roles,
    },
  } as AuthenticatedRequest;

  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a user with one of the required roles', () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => [RoleCode.Admin, RoleCode.Manager]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext([RoleCode.Admin]))).toBe(true);
  });

  it('allows the chief accountant only where that role is explicitly accepted', () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => [
        RoleCode.Admin,
        RoleCode.ChiefAccountant,
      ]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(createContext([RoleCode.ChiefAccountant])),
    ).toBe(true);
  });

  it('rejects a user without an accepted admin-web role', () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => [RoleCode.Admin, RoleCode.Manager]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext([RoleCode.Employee]))).toThrow(
      ForbiddenException,
    );
  });
});
