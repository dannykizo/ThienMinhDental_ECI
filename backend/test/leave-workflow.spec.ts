import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { LeaveService } from '../src/modules/leave/leave.service.js';
import { LeaveWorkflowService } from '../src/modules/leave/application/leave-workflow.service.js';
import { independentReviewers, workflowPermissions, type LeaveWorkflow } from '../src/modules/leave/domain/leave-workflow.js';
import { RoleCode } from '../src/modules/auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../src/modules/auth/application/auth.service.js';
import type { ManagementGrant } from '../src/modules/organization-access/domain/management-access.js';

const now = new Date('2026-10-06T03:00:00Z');
const team = { id: 'team', departmentId: 'department', isActive: true };
const item: LeaveWorkflow = { employeeId: 'employee', submittedBy: 'owner', status: 'SUBMITTED', approvalStage: 'LEADER_CONFIRMATION', workflowTeamId: team.id, leaderUserId: 'leader', headUserId: 'head', confirmedBy: null };
const grant: ManagementGrant = { id: 'grant', userId: 'leader', employeeId: 'leader-employee', employeeCode: 'DEV', employeeName: 'Development only', roleCode: 'TEAM_LEADER', departmentId: 'department', departmentName: 'Development only', teamId: team.id, teamName: 'Development only', appointmentType: 'OFFICIAL', validFrom: '2026-10-01T00:00:00Z', validUntil: null, reason: 'Development only', createdAt: now.toISOString(), createdByName: 'Admin', revokedAt: null, revokedByName: null, revocationReason: null, eligible: true };
const head = { ...grant, id: 'head-grant', userId: 'head', roleCode: 'DEPARTMENT_HEAD' as const, teamId: null };
const grants = [grant, head];
const permissions = (value: LeaveWorkflow = item, actor = 'leader', employee = 'leader-employee', rights = grants): ReturnType<typeof workflowPermissions> => workflowPermissions(value, actor, employee, rights, team, now);

describe('PQ5 scoped two-step leave policy', () => {
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


describe('PQ5 leave final review keeps existing balance/rejection rules',()=>{
  const admin:AuthenticatedUserView={id:'admin',employeeId:'admin-employee',email:'development@example.invalid',displayName:'Development only',roles:[RoleCode.Admin]};
  it('rejects absent/whitespace/short rejection notes before calling the workflow',async()=>{
    const process=vi.fn();
    const service=new LeaveService({} as DataSource,{process} as unknown as LeaveWorkflowService);
    for(const reviewNote of [undefined,'   ','no']) await expect(service.review('id',admin,{status:'REJECTED',expectedVersion:1,reviewNote})).rejects.toMatchObject({response:{code:'LEAVE_REJECTION_REASON_REQUIRED'}});
    expect(process).not.toHaveBeenCalled();
  });
  it('delegates final approval with a balance validator in the workflow transaction',async()=>{
    const process=vi.fn().mockResolvedValue({});
    const service=new LeaveService({} as DataSource,{process} as unknown as LeaveWorkflowService);
    await service.review('id',admin,{status:'APPROVED',expectedVersion:3});
    expect(process).toHaveBeenCalledWith(admin,'id',{status:'APPROVED',expectedVersion:3},false,expect.any(Function));
  });
});
