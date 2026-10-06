import { grantStatus, type ManagementGrant } from '../../organization-access/domain/management-access.js';

export type ExplanationStage = 'EMPLOYEE_RESPONSE' | 'WAITING_ROUTING' | 'LEADER_CONFIRMATION' | 'HEAD_APPROVAL' | 'COMPLETED';
export interface ExplanationWorkflow {
  employeeId: string;
  submittedBy: string | null;
  status: string;
  approvalStage: ExplanationStage | null;
  workflowTeamId: string | null;
  leaderUserId: string | null;
  headUserId: string | null;
  confirmedBy: string | null;
}
export interface WorkflowTeam { id: string; departmentId: string; isActive: boolean; }

export function hasWorkflowGrant(grants: ManagementGrant[], userId: string | null, role: 'TEAM_LEADER' | 'DEPARTMENT_HEAD', team: WorkflowTeam | null, now: Date): boolean {
  return Boolean(team?.isActive && userId && grants.some((grant) => grant.userId === userId && grant.roleCode === role
    && grantStatus(grant, now) === 'ACTIVE' && grant.departmentId === team.departmentId
    && (role === 'DEPARTMENT_HEAD' || grant.teamId === team.id)));
}

export function independentReviewers(ownerId: string | null, leaderId: string | null, headId: string | null, confirmedBy: string | null = null): boolean {
  return Boolean(leaderId && headId && leaderId !== headId && leaderId !== ownerId && headId !== ownerId && headId !== confirmedBy);
}

export function workflowPermissions(item: ExplanationWorkflow, actorId: string, actorEmployeeId: string | null | undefined, grants: ManagementGrant[], team: WorkflowTeam | null, now: Date): { canConfirm: boolean; canReview: boolean; canRead: boolean; routingRequired: boolean } {
  const independent = independentReviewers(item.submittedBy, item.leaderUserId, item.headUserId, item.confirmedBy);
  const leader = independent && actorEmployeeId !== item.employeeId && actorId === item.leaderUserId && hasWorkflowGrant(grants, actorId, 'TEAM_LEADER', team, now);
  const head = independent && actorEmployeeId !== item.employeeId && actorId === item.headUserId && hasWorkflowGrant(grants, actorId, 'DEPARTMENT_HEAD', team, now);
  const open = item.status === 'SUBMITTED';
  const routingRequired = open && (!independent || (item.confirmedBy
    ? !hasWorkflowGrant(grants, item.headUserId, 'DEPARTMENT_HEAD', team, now)
    : !hasWorkflowGrant(grants, item.leaderUserId, 'TEAM_LEADER', team, now) || !hasWorkflowGrant(grants, item.headUserId, 'DEPARTMENT_HEAD', team, now)));
  return {
    canConfirm: open && !routingRequired && item.approvalStage === 'LEADER_CONFIRMATION' && !item.confirmedBy && leader,
    canReview: open && !routingRequired && item.approvalStage === 'HEAD_APPROVAL' && Boolean(item.confirmedBy) && head,
    canRead: leader || head,
    routingRequired,
  };
}
