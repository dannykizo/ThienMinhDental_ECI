import type { EntityManager } from 'typeorm';

export const remainingBalanceSql = `bal.entitlement_minutes+bal.carry_over_minutes
  +COALESCE((SELECT SUM(a.delta_minutes) FROM leave_balance_adjustments a WHERE a.balance_id=bal.id),0)
  -COALESCE((SELECT SUM(l.requested_minutes) FROM leave_requests l WHERE l.employee_id=bal.employee_id
    AND l.policy_id=bal.policy_id AND l.status IN ('SUBMITTED','APPROVED')
    AND EXTRACT(YEAR FROM l.start_date)::int=bal.balance_year),0)`;

// Shared read projection: reporting must not initialize balances or invent a second quota rule.
export function readLeaveBalances<T = unknown>(reader: Pick<EntityManager, 'query'>, year: number, employeeId?: string, includeDepartmentId = false): Promise<T[]> {
  const carry = 'COALESCE(b.carry_over_minutes,LEAST(COALESCE(previous.remaining,0),p.max_carry_over_minutes))';
  return reader.query(`SELECT e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName",${includeDepartmentId ? 'e.department_id AS "departmentId",' : ''}d.name AS "departmentName",p.id AS "policyId",p.code AS "policyCode",p.name AS "policyName",p.day_minutes AS "dayMinutes",b.id AS "balanceId",(b.id IS NOT NULL) AS "initialized",COALESCE(b.entitlement_minutes,p.annual_entitlement_minutes)::int AS "entitlementMinutes",${carry}::int AS "carryOverMinutes",COALESCE(adj.minutes,0)::int AS "adjustmentMinutes",COALESCE(used.approved,0)::int AS "approvedMinutes",COALESCE(used.pending,0)::int AS "pendingMinutes",(COALESCE(b.entitlement_minutes,p.annual_entitlement_minutes)+${carry}+COALESCE(adj.minutes,0)-COALESCE(used.approved,0)-COALESCE(used.pending,0))::int AS "availableMinutes" FROM employees e CROSS JOIN leave_policies p LEFT JOIN employee_leave_balances b ON b.employee_id=e.id AND b.policy_id=p.id AND b.balance_year=$1
    LEFT JOIN LATERAL (SELECT GREATEST(0,${remainingBalanceSql})::int remaining FROM employee_leave_balances bal
      WHERE bal.employee_id=e.id AND bal.policy_id=p.id AND bal.balance_year=$1::int-1) previous ON b.id IS NULL AND p.carry_over_enabled
    LEFT JOIN LATERAL (SELECT SUM(delta_minutes)::int minutes FROM leave_balance_adjustments WHERE balance_id=b.id) adj ON true LEFT JOIN LATERAL (SELECT SUM(requested_minutes) FILTER (WHERE status='APPROVED')::int approved,SUM(requested_minutes) FILTER (WHERE status='SUBMITTED')::int pending FROM leave_requests WHERE employee_id=e.id AND policy_id=p.id AND EXTRACT(YEAR FROM start_date)::int=$1) used ON true LEFT JOIN departments d ON d.id=e.department_id WHERE e.is_active=true AND p.is_active=true AND p.balance_tracking_enabled=true AND ($2::uuid IS NULL OR e.id=$2) ORDER BY e.full_name,p.name`, [year, employeeId ?? null]);
}
