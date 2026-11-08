import type { EntityManager } from 'typeorm';
import { readLeaveBalances } from '../leave/infrastructure/leave-balance-reader.js';

export type ReportKind = 'leave' | 'overtime' | 'explanations';
export type ReportValue = string | number | boolean | null;
export interface ReportRecord extends Record<string, ReportValue> {
  employeeId: string; employeeCode: string; fullName: string; departmentId: string | null; departmentName: string | null;
}
export interface SupportingReports {
  capturedAt: string; leave: ReportRecord[]; balances: ReportRecord[]; balanceAdjustments: ReportRecord[];
  overtime: ReportRecord[]; explanations: ReportRecord[]; adjustments: ReportRecord[]; audit: ReportRecord[];
}
export interface ReportIssue extends ReportRecord { workDate: string; note: string }

const identity = `e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",e.department_id AS "departmentId",d.name AS "departmentName"`;
const workflow = `r.status,r.approval_stage AS "approvalStage",t.name AS "teamName",
  COALESCE(l.full_name,lu.email) AS "leaderName",COALESCE(h.full_name,hu.email) AS "headName",
  COALESCE(c.full_name,cu.email) AS "confirmedByName",r.confirmed_at::text AS "confirmedAt",r.confirmation_note AS "confirmationNote",
  COALESCE(v.full_name,vu.email) AS "reviewedByName",r.reviewed_at::text AS "reviewedAt",r.review_note AS "reviewNote",
  r.decision_method AS "decisionMethod",r.admin_override_reason AS "adminOverrideReason"`;
const joins = `JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id
  LEFT JOIN organization_teams t ON t.id=r.workflow_team_id
  LEFT JOIN users lu ON lu.id=r.leader_user_id LEFT JOIN employees l ON l.user_id=lu.id
  LEFT JOIN users hu ON hu.id=r.head_user_id LEFT JOIN employees h ON h.user_id=hu.id
  LEFT JOIN users cu ON cu.id=r.confirmed_by LEFT JOIN employees c ON c.user_id=cu.id
  LEFT JOIN users vu ON vu.id=r.reviewed_by LEFT JOIN employees v ON v.user_id=vu.id`;

export async function readPendingIssues(reader: Pick<EntityManager, 'query'>, month: string): Promise<ReportIssue[]> {
  const rows = await reader.query<ReportRecord[]>(`WITH pending AS (
    SELECT employee_id,start_date AS work_date,status,approval_stage,'Nghỉ phép' AS kind FROM leave_requests
      WHERE status='SUBMITTED' AND start_date < ($1::date+INTERVAL '1 month') AND end_date >= $1::date
    UNION ALL SELECT employee_id,work_date,status,approval_stage,'OT' FROM overtime_requests
      WHERE status='SUBMITTED' AND work_date >= $1::date AND work_date < ($1::date+INTERVAL '1 month')
    UNION ALL SELECT employee_id,work_date,status,approval_stage,'Giải trình' FROM attendance_explanation_requests
      WHERE status IN ('REQUESTED','SUBMITTED') AND work_date >= $1::date AND work_date < ($1::date+INTERVAL '1 month')
    ) SELECT ${identity},r.work_date::text AS "workDate",r.status,r.approval_stage AS "approvalStage",r.kind
    FROM pending r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id ORDER BY r.work_date,e.employee_code,r.kind`, [`${month}-01`]);
  return rows.map(row => ({ ...row, workDate: String(row.workDate), note: `${String(row.kind)}: ${requestNote(row)}` }));
}

export function requestNote(row: ReportRecord): string {
  const notes: string[] = [];
  if (row.status === 'REQUESTED') notes.push('Chưa có phản hồi nhân viên; chưa hoàn tất.');
  if (row.status === 'SUBMITTED') notes.push('Đang chờ xử lý; chưa ghi nhận là đã duyệt.');
  if (row.approvalStage === 'WAITING_ROUTING') notes.push('Chưa có tuyến duyệt hợp lệ.');
  if (row.status === 'REJECTED') notes.push('Đã từ chối; không cộng vào phép/OT đã duyệt.');
  if (row.status === 'CANCELLED') notes.push('Đã hủy; không trừ quỹ phép.');
  if (['APPROVED', 'REJECTED'].includes(String(row.status)) && !row.reviewedByName) notes.push('Thiếu thông tin người xử lý trong dữ liệu lịch sử.');
  if (!row.departmentName) notes.push('Chưa có phòng ban.');
  return notes.join(' ');
}

export async function readSupportingReports(reader: Pick<EntityManager, 'query'>, month: string): Promise<SupportingReports> {
  const params = [`${month}-01`];
  const leave = await reader.query<ReportRecord[]>(`SELECT r.id,${identity},${workflow},r.start_date::text AS "startDate",r.end_date::text AS "endDate",
    r.duration_type AS "durationType",r.half_day_period AS "halfDayPeriod",r.start_time::text AS "startTime",r.end_time::text AS "endTime",
    r.requested_minutes AS "requestedMinutes",r.reason,p.name AS "policyName",p.code AS "policyCode",p.day_minutes AS "dayMinutes",
    r.submitted_at::text AS "submittedAt",r.cancelled_at::text AS "cancelledAt",r.cancellation_reason AS "cancellationReason",COALESCE(x.full_name,xu.email) AS "cancelledByName"
    FROM leave_requests r ${joins} LEFT JOIN leave_policies p ON p.id=r.policy_id LEFT JOIN users xu ON xu.id=r.cancelled_by LEFT JOIN employees x ON x.user_id=xu.id
    WHERE r.start_date < ($1::date+INTERVAL '1 month') AND r.end_date >= $1::date ORDER BY r.start_date,e.employee_code,r.id`, params);
  const overtime = await reader.query<ReportRecord[]>(`SELECT r.id,${identity},${workflow},r.work_date::text AS "workDate",r.requested_minutes AS "requestedMinutes",
    r.reason,r.work_content AS "workContent",r.submitted_at::text AS "submittedAt" FROM overtime_requests r ${joins}
    WHERE r.work_date >= $1::date AND r.work_date < ($1::date+INTERVAL '1 month') ORDER BY r.work_date,e.employee_code,r.id`, params);
  const explanations = await reader.query<ReportRecord[]>(`SELECT r.id,${identity},${workflow},r.work_date::text AS "workDate",r.issue_type AS "issueType",r.source,
    r.request_note AS "requestNote",r.response_text AS "responseText",(r.evidence_image_reference IS NOT NULL) AS "hasEvidence",r.created_at::text AS "createdAt"
    FROM attendance_explanation_requests r ${joins} WHERE r.work_date >= $1::date AND r.work_date < ($1::date+INTERVAL '1 month') ORDER BY r.work_date,e.employee_code,r.id`, params);
  const adjustments = await reader.query<ReportRecord[]>(`SELECT r.id,${identity},r.work_date::text AS "workDate",r.field_name AS "fieldName",
    r.old_value#>>'{}' AS "oldValue",r.new_value#>>'{}' AS "newValue",r.reason,r.created_at::text AS "createdAt",COALESCE(a.full_name,u.email) AS "actorName"
    FROM attendance_adjustments r JOIN employees e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=e.department_id
    LEFT JOIN users u ON u.id=r.adjusted_by LEFT JOIN employees a ON a.user_id=u.id
    WHERE r.work_date >= $1::date AND r.work_date < ($1::date+INTERVAL '1 month') ORDER BY r.work_date,r.created_at,r.id`, params);
  const balances = (await readLeaveBalances<ReportRecord>(reader, Number(month.slice(0, 4)), undefined, true)).map(row => ({ ...row, fullName: String(row.employeeName) }));
  const balanceAdjustments = await reader.query<ReportRecord[]>(`SELECT r.id,${identity},p.name AS "policyName",r.delta_minutes AS "deltaMinutes",r.reason,r.created_at::text AS "createdAt",COALESCE(a.full_name,u.email) AS "actorName"
    FROM leave_balance_adjustments r JOIN employee_leave_balances b ON b.id=r.balance_id JOIN employees e ON e.id=b.employee_id
    LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN leave_policies p ON p.id=b.policy_id LEFT JOIN users u ON u.id=r.created_by LEFT JOIN employees a ON a.user_id=u.id
    WHERE b.balance_year=$1 ORDER BY r.created_at,r.id`, [Number(month.slice(0, 4))]);
  const ids = [...leave, ...overtime, ...explanations].map(row => row.id);
  const audit = await reader.query<ReportRecord[]>(`SELECT r.resource_id AS "requestId",r.resource_type AS "resourceType",r.action,r.created_at::text AS "createdAt",COALESCE(a.full_name,u.email) AS "actorName"
    FROM configuration_audit_logs r LEFT JOIN users u ON u.id=r.created_by LEFT JOIN employees a ON a.user_id=u.id
    WHERE r.resource_type IN ('LEAVE_REQUEST','OVERTIME_REQUEST','ATTENDANCE_EXPLANATION') AND r.resource_id=ANY($1::uuid[]) ORDER BY r.created_at,r.id`, [ids]);
  return { capturedAt: new Date().toISOString(), leave, balances, balanceAdjustments, overtime, explanations, adjustments, audit };
}

export function filterSupporting(data: SupportingReports, employeeId?: string, departmentId?: string): SupportingReports {
  const matches = (row: ReportRecord): boolean => (!employeeId || row.employeeId === employeeId) && (!departmentId || row.departmentId === departmentId);
  const leave = data.leave.filter(matches), overtime = data.overtime.filter(matches), explanations = data.explanations.filter(matches);
  const ids = new Set([...leave, ...overtime, ...explanations].map(row => row.id));
  return { ...data, leave, overtime, explanations, balances: data.balances.filter(matches), balanceAdjustments: data.balanceAdjustments.filter(matches),
    adjustments: data.adjustments.filter(matches), audit: data.audit.filter(row => ids.has(row.requestId)) };
}
