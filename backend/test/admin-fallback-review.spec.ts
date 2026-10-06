import 'reflect-metadata';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { DataSource } from 'typeorm';
import { workflowPermissions as leavePermissions, type LeaveWorkflow } from '../src/modules/leave/domain/leave-workflow.js';
import { workflowPermissions as explanationPermissions, type ExplanationWorkflow } from '../src/modules/attendance/domain/explanation-workflow.js';
import type { ManagementGrant } from '../src/modules/organization-access/domain/management-access.js';
import { LeaveWorkflowService } from '../src/modules/leave/application/leave-workflow.service.js';
import { ExplanationWorkflowService } from '../src/modules/attendance/application/explanation-workflow.service.js';
import { AnnouncementEntity, LeaveRequestEntity, AttendanceExplanationEntity } from '../src/database/entities/workforce.entity.js';
import type { AnnouncementsService } from '../src/modules/announcements/announcements.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';

const now = new Date('2026-10-06T03:00:00Z');
const team = { id: 'team', departmentId: 'department', isActive: true };
const missing: LeaveWorkflow & ExplanationWorkflow = { employeeId: 'employee', submittedBy: 'owner', status: 'SUBMITTED', approvalStage: 'WAITING_ROUTING', workflowTeamId: null, leaderUserId: null, headUserId: null, confirmedBy: null };
const leader: ManagementGrant = { id: 'leader-grant', userId: 'leader', employeeId: 'leader-employee', employeeCode: 'DEV', employeeName: 'Development only', roleCode: 'TEAM_LEADER', departmentId: team.departmentId, departmentName: 'Development only', teamId: team.id, teamName: 'Development only', appointmentType: 'OFFICIAL', validFrom: '2026-10-01T00:00:00Z', validUntil: null, reason: 'Development only', createdAt: now.toISOString(), createdByName: 'Admin', revokedAt: null, revokedByName: null, revocationReason: null, eligible: true };
const head = { ...leader, id: 'head-grant', userId: 'head', roleCode: 'DEPARTMENT_HEAD' as const, teamId: null };
const routed: LeaveWorkflow & ExplanationWorkflow = { ...missing, approvalStage: 'LEADER_CONFIRMATION', workflowTeamId: team.id, leaderUserId: 'leader', headUserId: 'head' };

describe.each([['leave', leavePermissions], ['explanation', explanationPermissions]] as const)('%s Admin fallback policy', (_module, policy) => {
  const can = (item = missing, grants: ManagementGrant[] = [], actor = 'admin', employee = 'admin-employee', admin = true): boolean => policy(item, actor, employee, grants, item.workflowTeamId ? team : null, now, admin).canAdminReview;
  it('requires Admin, a submitted open request and a missing/invalid live route', () => {
    expect(can()).toBe(true);
    expect(can(missing, [], 'ordinary', 'ordinary-employee', false)).toBe(false);
    expect(can(routed, [leader, head])).toBe(false);
    expect(can(routed, [leader, { ...head, revokedAt: now.toISOString() }])).toBe(true);
    expect(can(routed, [{ ...leader, validUntil: now.toISOString() }, head])).toBe(true);
    for (const status of ['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED']) expect(can({ ...missing, status })).toBe(false);
  });
  it('does not permit the owner, submitting Admin or actual confirmer to decide', () => {
    expect(can(missing, [], 'admin', missing.employeeId)).toBe(false);
    expect(can({ ...missing, submittedBy: 'admin' })).toBe(false);
    expect(can({ ...routed, confirmedBy: 'admin', approvalStage: 'HEAD_APPROVAL' }, [])).toBe(false);
  });
  it('does not reopen a completed step or invalidate completed confirmation when only Leader expires', () => {
    const confirmed = { ...routed, approvalStage: 'HEAD_APPROVAL' as const, confirmedBy: 'leader' };
    expect(can(confirmed, [head])).toBe(false);
    expect(can(confirmed, [])).toBe(true);
    expect(can({ ...missing, approvalStage: 'COMPLETED' })).toBe(false);
  });
});

describe.each(['leave', 'explanation'] as const)('%s fallback transaction', kind => {
  const admin: AuthenticatedUserView = { id: 'admin', employeeId: 'admin-employee', displayName: 'Development Admin', email: 'development@example.invalid', roles: [RoleCode.Admin] };
  function fixture(): { service: LeaveWorkflowService | ExplanationWorkflowService; entity: LeaveRequestEntity | AttendanceExplanationEntity; repo: { findOneBy: Mock; findOne: Mock; save: Mock }; annRepo: { create: Mock<(value: object) => object>; save: Mock }; query: Mock<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>; sender: { deliverPublishedAnnouncementPush: Mock } } {
    const entity = Object.assign(kind === 'leave' ? new LeaveRequestEntity() : new AttendanceExplanationEntity(), missing, { id: 'request', workDate: '2026-10-06', startDate: '2026-10-06', endDate: '2026-10-06', routeVersion: 2, confirmedAt: null });
    const repo = { findOneBy: vi.fn().mockResolvedValue(entity), findOne: vi.fn().mockResolvedValue(entity), save: vi.fn().mockResolvedValue(entity) };
    const annRepo = { create: vi.fn((value: object): object => value), save: vi.fn().mockResolvedValue({ id: 'announcement' }) };
    const query = vi.fn((sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
      void _parameters;
      return Promise.resolve(sql.includes('SELECT status FROM attendance_periods') ? [{ status: 'OPEN' }] : sql.includes('SELECT user_id') ? [{ userId: 'owner' }] : sql.includes('SELECT e.id FROM employees') ? [{ id: 'employee' }] : sql.includes('COALESCE(e.full_name,u.email) AS name') ? [{ name: 'Development Admin' }] : []);
    });
    const manager = { query, getRepository: (entityType: unknown): typeof repo | typeof annRepo => entityType === AnnouncementEntity ? annRepo : repo };
    const db = { transaction: (callback: (value: typeof manager) => Promise<unknown>): Promise<unknown> => callback(manager) } as unknown as DataSource;
    const sender = { deliverPublishedAnnouncementPush: vi.fn().mockResolvedValue({}) };
    const service = kind === 'leave' ? new LeaveWorkflowService(db, sender as unknown as AnnouncementsService) : new ExplanationWorkflowService(db, sender as unknown as AnnouncementsService);
    return { service, entity, repo, annRepo, query, sender };
  }
  it('requires explicit fallback intent and a meaningful reason', async () => {
    for (const input of [{ expectedVersion: 2, status: 'APPROVED' as const }, { expectedVersion: 2, status: 'APPROVED' as const, adminOverrideReason: '     ' }]) {
      const { service, repo } = fixture();
      await expect(service.process(admin, 'request', input, false)).rejects.toBeDefined();
      expect(repo.save).not.toHaveBeenCalled();
    }
  });
  it('records only the real decision, preserves absent confirmation and includes actor name in inbox', async () => {
    const { service, query, annRepo, sender } = fixture();
    const result = await service.process(admin, 'request', { expectedVersion: 2, status: 'REJECTED', adminOverrideReason: 'Development-only invalid route', reviewNote: 'Development-only rejection' }, false);
    expect(result).toMatchObject({ status: 'REJECTED', reviewedBy: 'admin', confirmedBy: null, confirmedAt: null, decisionMethod: 'ADMIN_FALLBACK', approvalStage: 'COMPLETED', routeVersion: 3 });
    expect(query.mock.calls.some(([sql, parameters]) => sql.includes('INSERT INTO configuration_audit_logs') && parameters?.includes('ADMIN_FALLBACK_REVIEW'))).toBe(true);
    const created = annRepo.create.mock.calls[0]?.[0] as { body: string } | undefined;
    expect(created?.body).toContain('bởi Development Admin (Admin duyệt thay)');
    expect(sender.deliverPublishedAnnouncementPush).toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('attendance_adjustments'))).toBe(false);
  });
  it('keeps the leave approval balance validator in the transaction', async () => {
    const { service, entity } = fixture();
    if (!(service instanceof LeaveWorkflowService)) return;
    const validateBalance = vi.fn().mockResolvedValue(undefined);
    await service.process(admin, 'request', { expectedVersion: 2, status: 'APPROVED', adminOverrideReason: 'Development-only invalid route' }, false, validateBalance);
    expect(validateBalance).toHaveBeenCalledOnce();
    expect(validateBalance.mock.calls[0]?.[1]).toBe(entity);
  });
});
