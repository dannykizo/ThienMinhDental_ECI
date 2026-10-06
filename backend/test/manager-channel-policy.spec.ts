import { describe, expect, it } from 'vitest';
import { portalAccess, replacesSession } from '../src/modules/auth/domain/portal-access.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { ManagementGrant } from '../src/modules/organization-access/domain/management-access.js';

const now = new Date('2026-10-06T03:00:00Z');
const grant: ManagementGrant = {
  id: 'grant', userId: 'user', employeeId: 'employee', employeeCode: 'DEV', employeeName: 'Development only',
  roleCode: 'TEAM_LEADER', departmentId: 'department', departmentName: 'Development', teamId: 'team', teamName: 'Dev team',
  appointmentType: 'TEMPORARY', validFrom: now.toISOString(), validUntil: '2026-10-07T03:00:00Z',
  reason: 'Development only', createdAt: now.toISOString(), createdByName: 'Admin',
  revokedAt: null, revokedByName: null, revocationReason: null, eligible: true,
};

describe('PQ2 manager portal/session policy', () => {
  it('opens the scoped directory and PQ3 explanation workspace without broad module rights', () => {
    for (const roleCode of ['TEAM_LEADER', 'DEPARTMENT_HEAD'] as const) {
      const access = portalAccess([RoleCode.Employee], [{ ...grant, roleCode }], now);
      expect(access.webAllowed).toBe(true);
      expect(access.sessionMode).toBe('WEB_AND_MOBILE');
      expect(access.homePath).toBe('/dashboard/managed');
      expect(access.navigation).toEqual(['/dashboard/managed', '/dashboard/explanations']);
      expect(access.managementGrants[0]).not.toHaveProperty('reason');
    }
  });

  it('does not derive management rights from employee/global roles or membership', () => {
    const employee = portalAccess([RoleCode.Employee], [], now);
    expect(employee.webAllowed).toBe(false);
    expect(employee.sessionMode).toBe('SINGLE_ACCOUNT');
    expect(employee.navigation).toEqual([]);
    for (const role of [RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager]) {
      const access = portalAccess([role], [], now);
      expect(access.webAllowed).toBe(true);
      expect(access.sessionMode).toBe('SINGLE_ACCOUNT');
      expect(access.homePath).toBe('/dashboard');
    }
  });

  it('excludes future, expired, revoked and inactive scopes without using JWT snapshots', () => {
    const variants = [
      { ...grant, validFrom: '2026-10-06T03:00:00.001Z' },
      { ...grant, validUntil: now.toISOString() },
      { ...grant, revokedAt: now.toISOString() },
      { ...grant, eligible: false },
    ];
    for (const item of variants) expect(portalAccess([RoleCode.Employee], [item], now).webAllowed).toBe(false);
  });

  it('keeps another live grant and does not remove independent global Web access', () => {
    const revoked = { ...grant, revokedAt: now.toISOString() };
    expect(portalAccess([RoleCode.Employee], [revoked, { ...grant, id: 'other' }], now).sessionMode).toBe('WEB_AND_MOBILE');
    const admin = portalAccess([RoleCode.Admin], [revoked], now);
    expect(admin.webAllowed).toBe(true);
    expect(admin.navigation).toContain('/dashboard/organization');
    expect(admin.sessionMode).toBe('SINGLE_ACCOUNT');
  });

  it('replaces only the incoming channel for appointed managers and all channels otherwise', () => {
    for (const incoming of ['WEB', 'MOBILE'] as const) for (const existing of ['WEB', 'MOBILE'] as const) {
      expect(replacesSession('WEB_AND_MOBILE', incoming, existing)).toBe(incoming === existing);
      expect(replacesSession('SINGLE_ACCOUNT', incoming, existing)).toBe(true);
    }
  });
});
