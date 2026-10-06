import { grantStatus, type ManagementGrant } from '../../organization-access/domain/management-access.js';
import { RoleCode } from './role-code.js';

export type ActiveManagementGrant = Pick<ManagementGrant, 'id' | 'roleCode' | 'departmentId' | 'departmentName' | 'teamId' | 'teamName' | 'appointmentType' | 'validFrom' | 'validUntil'>;

export interface PortalAccess {
  webAllowed: boolean;
  sessionMode: 'SINGLE_ACCOUNT' | 'WEB_AND_MOBILE';
  homePath: '/dashboard' | '/dashboard/managed';
  navigation: string[];
  scopeLabel: string;
  managementGrants: ActiveManagementGrant[];
}

const adminRoutes = ['/dashboard', '/dashboard/employees', '/dashboard/access', '/dashboard/organization',
  '/dashboard/schedules', '/dashboard/locations', '/dashboard/attendance', '/dashboard/business-trips',
  '/dashboard/leave', '/dashboard/announcements', '/dashboard/disciplinary-actions', '/dashboard/reports',
  '/dashboard/kpi', '/dashboard/operations'];
const accountingRoutes = ['/dashboard', '/dashboard/employees', '/dashboard/attendance', '/dashboard/reports', '/dashboard/kpi'];
const legacyManagerRoutes = ['/dashboard', '/dashboard/employees', '/dashboard/announcements'];

// Routes expose scoped workspaces, never global module rights or approval overrides.
export function portalAccess(roles: RoleCode[], grants: ManagementGrant[], now: Date): PortalAccess {
  const managementGrants = grants.filter((grant) => grantStatus(grant, now) === 'ACTIVE').map((grant) => ({
    id: grant.id, roleCode: grant.roleCode, departmentId: grant.departmentId, departmentName: grant.departmentName,
    teamId: grant.teamId, teamName: grant.teamName, appointmentType: grant.appointmentType,
    validFrom: grant.validFrom, validUntil: grant.validUntil,
  }));
  const admin = roles.includes(RoleCode.Admin);
  const accountant = roles.includes(RoleCode.ChiefAccountant);
  const area = roles.includes(RoleCode.AreaManager);
  const legacy = roles.includes(RoleCode.Manager);
  const globalWeb = admin || accountant || area || legacy;
  const scoped = managementGrants.length > 0;
  const navigation = [...(admin ? adminRoutes : accountant ? accountingRoutes : area || legacy ? legacyManagerRoutes : [])];
  if (scoped) navigation.push('/dashboard/managed');
  if (admin || scoped) navigation.push('/dashboard/explanations');
  return {
    webAllowed: globalWeb || scoped,
    // PQ2 applies to explicitly appointed, currently eligible managers.
    // Existing global roles retain their session policy unless also appointed.
    sessionMode: scoped ? 'WEB_AND_MOBILE' : 'SINGLE_ACCOUNT',
    homePath: globalWeb ? '/dashboard' : '/dashboard/managed',
    navigation,
    scopeLabel: admin || accountant ? 'Toàn bộ chi nhánh' : globalWeb ? 'Chi nhánh được phân quyền' : 'Phòng ban / team được cấp quyền',
    managementGrants,
  };
}

export function replacesSession(mode: PortalAccess['sessionMode'], incoming: 'WEB' | 'MOBILE', existing: 'WEB' | 'MOBILE'): boolean {
  return mode === 'SINGLE_ACCOUNT' || incoming === existing;
}
