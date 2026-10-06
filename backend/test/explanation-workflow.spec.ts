import 'reflect-metadata';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { DataSource } from 'typeorm';
import { AnnouncementEntity, AttendanceExplanationEntity } from '../src/database/entities/workforce.entity.js';
import { ExplanationWorkflowService } from '../src/modules/attendance/application/explanation-workflow.service.js';
import { independentReviewers, workflowPermissions, type ExplanationWorkflow } from '../src/modules/attendance/domain/explanation-workflow.js';
import type { AnnouncementsService } from '../src/modules/announcements/announcements.service.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import type { ManagementGrant } from '../src/modules/organization-access/domain/management-access.js';

const now = new Date('2026-10-06T03:00:00Z');
const team = { id: 'team', departmentId: 'department', isActive: true };
const item: ExplanationWorkflow = { employeeId: 'employee', submittedBy: 'owner', status: 'SUBMITTED', approvalStage: 'LEADER_CONFIRMATION', workflowTeamId: team.id, leaderUserId: 'leader', headUserId: 'head', confirmedBy: null };
const grant: ManagementGrant = { id: 'grant', userId: 'leader', employeeId: 'leader-employee', employeeCode: 'DEV', employeeName: 'Development only', roleCode: 'TEAM_LEADER', departmentId: 'department', departmentName: 'Development only', teamId: team.id, teamName: 'Development only', appointmentType: 'OFFICIAL', validFrom: '2026-10-01T00:00:00Z', validUntil: null, reason: 'Development only', createdAt: now.toISOString(), createdByName: 'Admin', revokedAt: null, revokedByName: null, revocationReason: null, eligible: true };
const head = { ...grant, id: 'head-grant', userId: 'head', roleCode: 'DEPARTMENT_HEAD' as const, teamId: null };
const grants = [grant, head];
const permissions = (value: ExplanationWorkflow = item, actor = 'leader', employee = 'leader-employee', rights = grants): ReturnType<typeof workflowPermissions> => workflowPermissions(value, actor, employee, rights, team, now);

describe('PQ3 scoped two-step explanation policy', () => {
  it('requires distinct reviewers, neither owner nor completed confirmer may approve', () => {
    expect(independentReviewers('owner', 'leader', 'head')).toBe(true);
    for (const args of [['owner', 'owner', 'head'], ['owner', 'leader', 'owner'], ['owner', 'leader', 'leader'], ['owner', null, 'head']] as const) expect(independentReviewers(args[0], args[1], args[2])).toBe(false);
    expect(independentReviewers('owner', 'leader', 'head', 'head')).toBe(false);
  });
  it('allows only assigned Leader to confirm, only assigned Head after a real confirmation to decide', () => {
    expect(permissions()).toMatchObject({ canConfirm: true, canReview: false });
    expect(permissions(item, 'head', 'head-employee')).toMatchObject({ canRead: true, canConfirm: false, canReview: false });
    const confirmed = { ...item, approvalStage: 'HEAD_APPROVAL' as const, confirmedBy: 'leader' };
    expect(permissions(confirmed, 'head', 'head-employee')).toMatchObject({ canReview: true, canConfirm: false });
    expect(permissions(confirmed)).toMatchObject({ canReview: false, canConfirm: false });
    expect(permissions({ ...confirmed, confirmedBy: null }, 'head', 'head-employee').canReview).toBe(false);
  });
  it('does not grant Admin, another manager, another department or own employee an override', () => {
    expect(permissions(item, 'admin', 'admin-employee').canRead).toBe(false);
    expect(permissions(item, 'other', 'other-employee', [{ ...grant, userId: 'other' }, head]).canConfirm).toBe(false);
    expect(permissions(item, 'leader', item.employeeId).canConfirm).toBe(false);
    expect(permissions(item, 'leader', 'leader-employee', [{ ...grant, departmentId: 'elsewhere' }, head]).canRead).toBe(false);
  });
  it('requires Admin routing on expiry, revocation, missing Head or inactive scope, without skipping a step', () => {
    for (const bad of [{ ...grant, validUntil: now.toISOString() }, { ...grant, revokedAt: now.toISOString() }, { ...grant, eligible: false }, { ...grant, validFrom: '2026-10-07T00:00:00Z' }]) expect(permissions(item, 'leader', 'leader-employee', [bad, head])).toMatchObject({ canConfirm: false, routingRequired: true });
    expect(permissions(item, 'leader', 'leader-employee', [grant]).routingRequired).toBe(true);
    expect(workflowPermissions(item, 'leader', 'leader-employee', grants, { ...team, isActive: false }, now)).toMatchObject({ canConfirm: false, canRead: false, routingRequired: true });
  });
  it('preserves completed confirmation when Leader grant ends, but checks the Head live grant', () => {
    const confirmed = { ...item, approvalStage: 'HEAD_APPROVAL' as const, confirmedBy: 'leader' };
    expect(permissions(confirmed, 'head', 'head-employee', [head]).canReview).toBe(true);
    expect(permissions(confirmed, 'head', 'head-employee', [{ ...head, revokedAt: now.toISOString() }])).toMatchObject({ canReview: false, canRead: false, routingRequired: true });
    expect(permissions({ ...confirmed, status: 'APPROVED', approvalStage: 'COMPLETED' }, 'head', 'head-employee').canReview).toBe(false);
  });
  it('removes old unfinished reviewer access immediately after reroute', () => {
    const rerouted = { ...item, leaderUserId: 'new-leader' };
    expect(permissions(rerouted).canRead).toBe(false);
    expect(permissions(rerouted, 'new-leader', 'new-employee', [{ ...grant, userId: 'new-leader' }, head]).canConfirm).toBe(true);
  });
});

describe('PQ3 transaction/service boundaries', () => {
  const admin: AuthenticatedUserView = { id: 'admin', employeeId: 'admin-employee', email: 'development@example.invalid', displayName: 'Development only', roles: [RoleCode.Admin] };
  function fixture(status = 'SUBMITTED', version = 2, period = 'OPEN'): { service: ExplanationWorkflowService; repo: { findOneBy: Mock; findOne: Mock; save: Mock }; query: Mock } {
    const entity = Object.assign(new AttendanceExplanationEntity(), item, { id: 'explanation', workDate: '2026-10-06', status, routeVersion: version });
    const repo = { findOneBy: vi.fn().mockResolvedValue(entity), findOne: vi.fn().mockResolvedValue(entity), save: vi.fn().mockResolvedValue(entity) };
    const query = vi.fn((sql: string) => Promise.resolve(sql.includes('SELECT status FROM attendance_periods') ? [{ status: period }] : sql.includes('FROM organization_teams') ? [team] : []));
    const manager = { query, getRepository: (): typeof repo => repo };
    const db = { transaction: (callback: (m: typeof manager) => Promise<unknown>) => callback(manager) } as unknown as DataSource;
    const sender = { deliverPublishedAnnouncementPush: vi.fn() } as unknown as AnnouncementsService;
    return { service: new ExplanationWorkflowService(db, sender), repo, query };
  }
  it('rejects stale route version before any decision save', async () => {
    const { service, repo } = fixture();
    await expect(service.process(admin, 'explanation', { status: 'APPROVED', expectedVersion: 1 }, false)).rejects.toMatchObject({ response: { code: 'EXPLANATION_ROUTE_CHANGED' } });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects locked months and does not save decisions', async () => {
    const { service, repo } = fixture('SUBMITTED', 2, 'LOCKED');
    await expect(service.process(admin, 'explanation', { expectedVersion: 2 }, true)).rejects.toMatchObject({ response: { code: 'ATTENDANCE_PERIOD_LOCKED' } }); expect(repo.save).not.toHaveBeenCalled();
  });
  it('does not let Admin bypass assigned scoped review and does not re-review legacy final rows', async () => {
    for (const status of ['SUBMITTED', 'APPROVED']) {
      const { service, repo } = fixture(status);
      await expect(service.process(admin, 'explanation', { status: 'REJECTED', expectedVersion: 2 }, false)).rejects.toMatchObject({ response: { code: 'EXPLANATION_STEP_FORBIDDEN' } }); expect(repo.save).not.toHaveBeenCalled();
    }
  });
  it('requires Admin for direct reroute', async () => {
    await expect(fixture().service.reroute({ ...admin, roles: [RoleCode.Employee] }, 'explanation', { teamId: 'team', leaderUserId: 'leader', headUserId: 'head', reason: 'Development only', expectedVersion: 2 })).rejects.toMatchObject({ response: { code: 'EXPLANATION_ADMIN_REQUIRED' } });
  });
  it('records a real Head decision without a mandatory note and notifies legacy employee ownership after commit', async () => {
    const legacy = Object.assign(new AttendanceExplanationEntity(), item, { id: 'legacy', workDate: '2026-10-06', submittedBy: null, approvalStage: 'HEAD_APPROVAL', confirmedBy: 'leader', confirmedAt: now, routeVersion: 2 });
    const repo = { findOneBy: vi.fn().mockResolvedValue(legacy), findOne: vi.fn().mockResolvedValue(legacy), save: vi.fn().mockResolvedValue(legacy) };
    const announcement = { id: 'notification', title: 'Development only' };
    const annRepo = { create: vi.fn((value: object): object => value), save: vi.fn().mockResolvedValue(announcement) };
    const query = vi.fn((sql: string): Promise<unknown[]> => Promise.resolve(
      sql.includes('SELECT status FROM attendance_periods') ? [{ status: 'OPEN' }]
        : sql.includes('FROM organization_teams') ? [team]
          : sql.includes('FROM organization_management_grants g') ? grants.map((g) => ({ ...g, validFrom: new Date(g.validFrom), createdAt: new Date(g.createdAt) }))
            : sql.includes('SELECT user_id') ? [{ userId: 'owner' }]
              : sql.includes('SELECT e.id FROM employees') ? [{ id: item.employeeId }] : [],
    ));
    const manager = { query, getRepository: (entity: unknown): typeof repo | typeof annRepo => entity === AnnouncementEntity ? annRepo : repo };
    const db = { transaction: (callback: (m: typeof manager) => Promise<unknown>): Promise<unknown> => callback(manager) } as unknown as DataSource;
    const sender = { deliverPublishedAnnouncementPush: vi.fn().mockResolvedValue({}) };
    const service = new ExplanationWorkflowService(db, sender as unknown as AnnouncementsService);
    const result = await service.process({ ...admin, id: 'head', employeeId: 'head-employee', roles: [RoleCode.Employee] }, 'legacy', { expectedVersion: 2, status: 'REJECTED' }, false);
    expect(result).toMatchObject({ status: 'REJECTED', reviewNote: null, reviewedBy: 'head', confirmedBy: 'leader', approvalStage: 'COMPLETED', routeVersion: 3 });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO configuration_audit_logs'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO announcement_recipients'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('attendance_adjustments'))).toBe(false);
    expect(sender.deliverPublishedAnnouncementPush).toHaveBeenCalledWith(announcement, [item.employeeId]);
  });
});
