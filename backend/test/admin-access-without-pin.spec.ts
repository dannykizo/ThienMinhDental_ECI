import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { RetireAdminPin1792108800000 } from '../src/database/migrations/1792108800000-retire-admin-pin.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { AuthController } from '../src/modules/auth/presentation/auth.controller.js';
import { JwtAuthGuard } from '../src/modules/auth/presentation/jwt-auth.guard.js';
import { RolesGuard } from '../src/modules/auth/presentation/roles.guard.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { EmployeesController } from '../src/modules/employees/employees.controller.js';
import { basicEmployee } from '../src/modules/employees/domain/employee-directory.js';
import { OrganizationAccessController } from '../src/modules/organization-access/presentation/organization-access.controller.js';

const protectedHandlers = [
  ...['create', 'detail', 'history', 'update', 'changeStatus', 'account', 'resetPassword', 'deletionImpact', 'delete'].map(method => [EmployeesController, method] as const),
  ...['listSessions', 'revokeSession'].map(method => [AuthController, method] as const),
  ...['grant', 'revoke'].map(method => [OrganizationAccessController, method] as const),
];

describe('Admin access after PIN retirement', () => {
  it.each(protectedHandlers)('%s.%s still requires JWT/session and current ADMIN role', (controller, method) => {
    const handler = Object.getOwnPropertyDescriptor(controller.prototype, method)!.value as object;
    const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? Reflect.getMetadata(GUARDS_METADATA, controller)) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    const guard = new RolesGuard(new Reflector());
    const context = (roles: RoleCode[]): ExecutionContext => ({ getHandler: () => handler, getClass: () => controller,
      switchToHttp: () => ({ getRequest: (): unknown => ({ user: { roles } }) }) }) as unknown as ExecutionContext;
    expect(guard.canActivate(context([RoleCode.Admin]))).toBe(true);
    expect(() => guard.canActivate(context([RoleCode.Employee]))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context([RoleCode.Manager]))).toThrow(ForbiddenException);
  });

  it('does not register obsolete public recovery/handover endpoints', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthModule)).toEqual([AuthController]);
  });

  it('keeps private profile/account fields out of the shared directory', () => {
    expect(basicEmployee({ id: 'fixture', employeeCode: 'DEV', fullName: 'Development only',
      employeeType: 'OFFICE', isActive: true, userId: 'fixture-user', phone: 'private',
      hireDate: '2020-01-01', user: { passwordHash: 'private' } })).toEqual({
      id: 'fixture', employeeCode: 'DEV', fullName: 'Development only', employeeType: 'OFFICE',
      isActive: true, userId: 'fixture-user', hasAccount: true,
    });
  });

  it('retires PIN authority without dropping history or normal login sessions', async () => {
    let sql = '';
    await new RetireAdminPin1792108800000().up({ query: (value: string) => { sql = value; return Promise.resolve([]); } } as unknown as QueryRunner);
    expect(sql).toContain('cancelled_at=now()');
    expect(sql).toContain('revoked_at=now()');
    expect(sql).toContain('pin_hash=NULL');
    expect(sql).not.toMatch(/DROP|DELETE|auth_sessions|configuration_audit_logs/i);
    await expect(new RetireAdminPin1792108800000().down()).rejects.toThrow('EXPLICIT_REENABLE_MIGRATION');
  });
});
