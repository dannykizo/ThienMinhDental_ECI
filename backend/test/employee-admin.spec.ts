import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import type { PasswordHasher } from '../src/modules/auth/application/auth.ports.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import { EmployeeAdminService } from '../src/modules/employees/employee-admin.service.js';
import { EmployeeFileCleanup, isEmployeeEvidenceFilename } from '../src/modules/employees/infrastructure/employee-file-cleanup.js';

describe('employee Admin boundary', () => {
  const actor: AuthenticatedUserView = { id: 'fixture', employeeId: null, email: 'development.invalid', displayName: 'Development only', roles: [RoleCode.Employee] };
  const service = new EmployeeAdminService({} as DataSource, {} as PasswordHasher, {} as EmployeeFileCleanup);
  it.each(['account','deletionImpact','resetPassword','delete'] as const)('%s denies non-Admin before persistence', async method => {
    const promise = method==='resetPassword' ? service.resetPassword(actor,'fixture',{newPassword:'abc123',reason:'Development only'})
      : method==='delete' ? service.delete(actor,'fixture',{employeeCode:'DEV',reason:'Development only',confirmationToken:'not-used'}) : service[method](actor,'fixture');
    await expect(promise).rejects.toMatchObject({response:{code:'ADMIN_REQUIRED'}});
  });
  it('allows only exact system image filenames, never paths/external/legacy strings', () => {
    expect(isEmployeeEvidenceFilename(`${randomUUID()}.png`)).toBe(true);
    for (const value of ['../secrets.env','C:\\Users\\secret.png','https://example.test/a.png','untracked.png',`${randomUUID()}.pdf`,'x'.repeat(500)]) expect(isEmployeeEvidenceFilename(value)).toBe(false);
  });
});
