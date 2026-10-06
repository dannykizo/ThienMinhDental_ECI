export type ManagementRole = 'DEPARTMENT_HEAD' | 'TEAM_LEADER';
export type AppointmentType = 'TEMPORARY' | 'OFFICIAL';
export type GrantStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'REVOKED' | 'INACTIVE';

export interface ManagementGrant {
  id: string;
  userId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  roleCode: ManagementRole;
  departmentId: string;
  departmentName: string;
  teamId: string | null;
  teamName: string | null;
  appointmentType: AppointmentType;
  validFrom: string;
  validUntil: string | null;
  reason: string;
  createdAt: string;
  createdByName: string;
  revokedAt: string | null;
  revokedByName: string | null;
  revocationReason: string | null;
  eligible: boolean;
}

export function grantStatus(grant: Pick<ManagementGrant, 'validFrom' | 'validUntil' | 'revokedAt' | 'eligible'>, now: Date): GrantStatus {
  if (grant.revokedAt) return 'REVOKED';
  const start = Date.parse(grant.validFrom);
  const end = grant.validUntil === null ? Infinity : Date.parse(grant.validUntil);
  if (!Number.isFinite(start) || Number.isNaN(end) || !Number.isFinite(now.getTime())) return 'INACTIVE';
  if (now.getTime() >= end) return 'EXPIRED';
  if (!grant.eligible) return 'INACTIVE';
  if (now.getTime() < start) return 'SCHEDULED';
  return 'ACTIVE';
}

export function validGrantWindow(from: string, until?: string | null): boolean {
  // Require an explicit offset: clients must not send ambiguous local timestamps.
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!timestamp.test(from) || !Number.isFinite(Date.parse(from))) return false;
  return until == null || (timestamp.test(until) && Number.isFinite(Date.parse(until)) && Date.parse(until) > Date.parse(from));
}

export function grantCoversTeam(grant: ManagementGrant, team: { id: string; departmentId: string }, now: Date): boolean {
  if (grantStatus(grant, now) !== 'ACTIVE') return false;
  return grant.roleCode === 'DEPARTMENT_HEAD'
    ? grant.departmentId === team.departmentId
    : grant.roleCode === 'TEAM_LEADER' && grant.teamId === team.id && grant.departmentId === team.departmentId;
}
