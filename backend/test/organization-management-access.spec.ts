import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import { OrganizationAccessService } from '../src/modules/organization-access/application/organization-access.service.js';
import { grantCoversTeam, grantStatus, validGrantWindow, type ManagementGrant } from '../src/modules/organization-access/domain/management-access.js';

const now = new Date('2026-10-06T03:00:00Z');
const grant: ManagementGrant = {
  id: 'grant',userId: 'manager',employeeId: 'employee',employeeCode: 'DEV',employeeName: 'Development only',
  roleCode: 'TEAM_LEADER',departmentId: 'department-a',departmentName: 'A',teamId: 'team-a',teamName: 'A',
  appointmentType: 'TEMPORARY',validFrom: '2026-10-06T03:00:00Z',validUntil: '2026-10-07T03:00:00Z',
  reason: 'Development only',createdAt: '2026-10-06T03:00:00Z',createdByName: 'Admin',revokedAt: null,revokedByName: null,revocationReason: null,eligible: true,
};
const employee: AuthenticatedUserView = { id: 'user',email: 'employee@development.invalid',employeeId: 'employee',displayName: 'Development only',roles: [RoleCode.Employee] };

describe('PQ1 grant policy', () => {
  it('includes the start and excludes the exact end instant', () => {
    expect(grantStatus(grant,now)).toBe('ACTIVE');
    expect(grantStatus(grant,new Date('2026-10-06T02:59:59.999Z'))).toBe('SCHEDULED');
    expect(grantStatus(grant,new Date('2026-10-07T03:00:00Z'))).toBe('EXPIRED');
  });

  it('supports both appointment types independently of indefinite duration', () => {
    expect(grantStatus({ ...grant,validUntil: null },new Date('2030-01-01T00:00:00Z'))).toBe('ACTIVE');
    const official: ManagementGrant = { ...grant,appointmentType: 'OFFICIAL',validUntil: null };
    expect(grantStatus(official,now)).toBe('ACTIVE');
  });

  it('fails closed for revoked and inactive account/scope grants', () => {
    expect(grantStatus({ ...grant,revokedAt: now.toISOString() },now)).toBe('REVOKED');
    expect(grantStatus({ ...grant,eligible: false },now)).toBe('INACTIVE');
    expect(grantStatus({ ...grant,validFrom: 'invalid' },now)).toBe('INACTIVE');
    expect(grantStatus({ ...grant,validUntil: 'invalid' },now)).toBe('INACTIVE');
    expect(grantStatus({ ...grant,eligible: false },new Date('2026-10-07T03:00:00Z'))).toBe('EXPIRED');
    expect(grantStatus(grant,new Date('invalid'))).toBe('INACTIVE');
  });

  it('never expands a Leader grant to sibling teams or to another department', () => {
    expect(grantCoversTeam(grant,{ id: 'team-a',departmentId: 'department-a' },now)).toBe(true);
    expect(grantCoversTeam(grant,{ id: 'team-b',departmentId: 'department-a' },now)).toBe(false);
    expect(grantCoversTeam({ ...grant,roleCode: 'DEPARTMENT_HEAD',teamId: null },{ id: 'team-b',departmentId: 'department-a' },now)).toBe(true);
    expect(grantCoversTeam({ ...grant,roleCode: 'DEPARTMENT_HEAD',teamId: null },{ id: 'team-c',departmentId: 'department-b' },now)).toBe(false);
  });

  it('does not allow revoked or expired grants to cover a team', () => {
    expect(grantCoversTeam({ ...grant,revokedAt: now.toISOString() },{ id: 'team-a',departmentId: 'department-a' },now)).toBe(false);
    expect(grantCoversTeam(grant,{ id: 'team-a',departmentId: 'department-a' },new Date(grant.validUntil!))).toBe(false);
  });

  it('requires explicit timezone and a strictly increasing validity window', () => {
    expect(validGrantWindow('2026-10-06T10:00:00+07:00',null)).toBe(true);
    expect(validGrantWindow(grant.validFrom,grant.validUntil)).toBe(true);
    expect(validGrantWindow('2026-10-06T10:00',null)).toBe(false);
    expect(validGrantWindow(grant.validFrom,grant.validFrom)).toBe(false);
    expect(validGrantWindow(grant.validFrom,'2026-10-05T00:00:00Z')).toBe(false);
  });
});

describe('PQ1 authorization boundary', () => {
  it('denies organization writes and grant/history inspection to ordinary employees', async () => {
    const transaction = vi.fn();
    const service = new OrganizationAccessService({ transaction } as unknown as DataSource);
    await expect(service.createTeam(employee,{ departmentId: 'department',code: 'DEV',name: 'Development only' })).rejects.toMatchObject({ status: 403 });
    await expect(service.createGrant(employee,{ employeeId: 'employee',roleCode: 'TEAM_LEADER',teamId: 'team',appointmentType: 'OFFICIAL',validFrom: now.toISOString(),reason: 'Development only' })).rejects.toMatchObject({ status: 403 });
    await expect(service.revokeGrant(employee,'grant','Development only')).rejects.toMatchObject({ status: 403 });
    await expect(service.listGrants(employee)).rejects.toMatchObject({ status: 403 });
    await expect(service.history(employee)).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not turn organization membership or a legacy Manager role into management access', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new OrganizationAccessService({ query } as unknown as DataSource);
    await expect(service.departmentEmployees(employee,'department')).rejects.toMatchObject({ status: 403 });
    await expect(service.departmentEmployees({ ...employee,roles: [RoleCode.Manager] },'department')).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps Leader department-wide access denied even if its team is in that department', async () => {
    const query = vi.fn().mockResolvedValue([{ ...grant,userId: employee.id,validFrom: new Date('2020-01-01T00:00:00Z'),validUntil: null,createdAt: now,revokedAt: null }]);
    const service = new OrganizationAccessService({ query } as unknown as DataSource);
    await expect(service.departmentEmployees(employee,'department-a')).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
