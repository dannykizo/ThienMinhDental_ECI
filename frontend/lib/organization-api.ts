export interface OrganizationTeam {
  id: string;
  departmentId: string;
  departmentName: string;
  departmentActive: boolean;
  code: string;
  name: string;
  isActive: boolean;
}

export interface OrganizationMember {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  branches: string[];
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  status: 'ACTIVE' | 'ENDED' | 'INACTIVE';
}

export interface ManagementGrant {
  id: string;
  employeeName: string;
  employeeCode: string;
  roleCode: 'DEPARTMENT_HEAD' | 'TEAM_LEADER';
  departmentName: string;
  teamName: string | null;
  appointmentType: 'TEMPORARY' | 'OFFICIAL';
  validFrom: string;
  validUntil: string | null;
  reason: string;
  createdByName: string;
  revokedAt: string | null;
  revokedByName: string | null;
  revocationReason: string | null;
  status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'REVOKED' | 'INACTIVE';
}

export interface OrganizationAudit {
  id: string;
  resourceType: string;
  resourceId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorName: string;
  createdAt: string;
}
