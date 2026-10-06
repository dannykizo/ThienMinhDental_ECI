import type { EntityManager } from 'typeorm';
import type { ManagementGrant } from '../domain/management-access.js';

// Shared persistence read: auth and directory evaluate the same grant policy,
// without an AuthModule -> OrganizationAccessModule dependency cycle.
export async function readManagementGrants(db: Pick<EntityManager, 'query'>, userId?: string): Promise<ManagementGrant[]> {
  type Row = Omit<ManagementGrant, 'validFrom' | 'validUntil' | 'createdAt' | 'revokedAt'> & {
    validFrom: Date; validUntil: Date | null; createdAt: Date; revokedAt: Date | null;
  };
  const rows = await db.query<Row[]>(`SELECT g.id,g.user_id AS "userId",e.id AS "employeeId",
    e.employee_code AS "employeeCode",e.full_name AS "employeeName",g.role_code AS "roleCode",
    d.id AS "departmentId",d.name AS "departmentName",t.id AS "teamId",t.name AS "teamName",
    g.appointment_type AS "appointmentType",g.valid_from AS "validFrom",g.valid_until AS "validUntil",
    g.reason,g.created_at AS "createdAt",COALESCE(creator_employee.full_name,creator.email) AS "createdByName",
    g.revoked_at AS "revokedAt",COALESCE(revoker_employee.full_name,revoker.email) AS "revokedByName",g.revocation_reason AS "revocationReason",
    (u.is_active AND e.is_active AND d.is_active AND (g.team_id IS NULL OR t.is_active)) AS eligible
    FROM organization_management_grants g
    JOIN users u ON u.id=g.user_id JOIN employees e ON e.user_id=u.id
    LEFT JOIN organization_teams t ON t.id=g.team_id
    JOIN departments d ON d.id=COALESCE(g.department_id,t.department_id)
    JOIN users creator ON creator.id=g.created_by LEFT JOIN users revoker ON revoker.id=g.revoked_by
    LEFT JOIN employees creator_employee ON creator_employee.user_id=creator.id
    LEFT JOIN employees revoker_employee ON revoker_employee.user_id=revoker.id
    ${userId ? 'WHERE g.user_id=$1' : ''} ORDER BY g.created_at DESC,g.id`, userId ? [userId] : []);
  return rows.map((row) => ({ ...row, validFrom: row.validFrom.toISOString(), validUntil: row.validUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null }));
}
