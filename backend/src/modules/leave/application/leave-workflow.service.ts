import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { AnnouncementEntity, LeaveRequestEntity } from '../../../database/entities/workforce.entity.js';
import { AnnouncementsService } from '../../announcements/announcements.service.js';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { grantStatus } from '../../organization-access/domain/management-access.js';
import { readManagementGrants } from '../../organization-access/infrastructure/management-grant.reader.js';
import type { ConfirmLeaveRequestDto, ReviewLeaveRequestDto, SetLeaveRouteDto } from '../leave.dto.js';
import { hasWorkflowGrant, independentReviewers, workflowPermissions, type WorkflowTeam } from '../domain/leave-workflow.js';

interface Route { employeeId: string; teamId: string; leaderUserId: string; headUserId: string; version: number; }
type LeaveView = LeaveRequestEntity & { employeeCode: string; fullName: string; teamName: string | null; departmentName: string | null; leaderName: string | null; headName: string | null; confirmedByName: string | null; reviewedByName: string | null; departmentId: string | null; teamActive: boolean | null; };
type Push = { announcement: AnnouncementEntity; employeeIds: string[] };

@Injectable()
export class LeaveWorkflowService {
  private readonly logger = new Logger(LeaveWorkflowService.name);
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly announcements: AnnouncementsService) {}

  private admin(user: AuthenticatedUserView): void {
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'LEAVE_ADMIN_REQUIRED', message: 'Chỉ Admin được cấu hình hoặc đổi tuyến.' });
  }
  private missing(): never { throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: 'Không tìm thấy đơn nghỉ phép trong phạm vi.' }); }
  private stale(actual: number, expected: number): void {
    if (actual !== expected) throw new ConflictException({ code: 'LEAVE_ROUTE_CHANGED', message: 'Đơn hoặc tuyến đã thay đổi. Hãy tải lại trước khi thao tác.' });
  }
  private async team(manager: Pick<EntityManager, 'query'>, id: string | null): Promise<WorkflowTeam | null> {
    if (!id) return null;
    const [team] = await manager.query<WorkflowTeam[]>(`SELECT t.id,t.department_id AS "departmentId",(t.is_active AND d.is_active) AS "isActive" FROM organization_teams t JOIN departments d ON d.id=t.department_id WHERE t.id=$1`, [id]);
    return team ?? null;
  }
  private async eligibleMember(manager: Pick<EntityManager, 'query'>, employeeId: string, teamId: string): Promise<boolean> {
    const [row] = await manager.query<Array<{ eligible: boolean }>>(`SELECT EXISTS(SELECT 1 FROM organization_team_memberships m JOIN organization_teams t ON t.id=m.team_id JOIN departments d ON d.id=t.department_id JOIN employees e ON e.id=m.employee_id JOIN users u ON u.id=e.user_id WHERE m.employee_id=$1 AND m.team_id=$2 AND m.ended_at IS NULL AND t.is_active AND d.is_active AND e.is_active AND u.is_active AND EXISTS(SELECT 1 FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id WHERE a.employee_id=e.id AND a.department_id=t.department_id AND b.is_active AND a.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (a.effective_to IS NULL OR a.effective_to >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))) AS eligible`, [employeeId, teamId]);
    return row.eligible;
  }
  private async validateRoute(manager: EntityManager, employeeId: string, input: SetLeaveRouteDto, confirmedBy: string | null = null, ownerId?: string | null): Promise<void> {
    if (input.reason.trim().length < 5) throw new BadRequestException({ code: 'LEAVE_ROUTE_REASON_REQUIRED', message: 'Lý do cấu hình hoặc đổi tuyến cần ít nhất 5 ký tự.' });
    const [employee] = await manager.query<Array<{ userId: string | null }>>(`SELECT user_id AS "userId" FROM employees WHERE id=$1`, [employeeId]);
    if (!employee || (!independentReviewers(employee.userId, input.leaderUserId, input.headUserId, confirmedBy) || !independentReviewers(ownerId ?? null, input.leaderUserId, input.headUserId, confirmedBy))) throw new BadRequestException({ code: 'LEAVE_INDEPENDENT_REVIEWERS_REQUIRED', message: 'Leader và Trưởng phòng phải khác nhau, không là người gửi hoặc người đã xác nhận.' });
    const team = await this.team(manager, input.teamId);
    const grants = await readManagementGrants(manager);
    if ((!confirmedBy && (!await this.eligibleMember(manager, employeeId, input.teamId) || !hasWorkflowGrant(grants, input.leaderUserId, 'TEAM_LEADER', team, new Date())))
      || !hasWorkflowGrant(grants, input.headUserId, 'DEPARTMENT_HEAD', team, new Date())) throw new BadRequestException({ code: 'LEAVE_ROUTE_INELIGIBLE', message: 'Team/thành viên hoặc quyền xử lý không còn hợp lệ trong phạm vi đã chọn.' });
  }
  private async periodOpen(manager: EntityManager, startDate: string, endDate: string): Promise<void> {
    await manager.query(`INSERT INTO attendance_periods(period_month,status) SELECT m::date,'OPEN' FROM generate_series(date_trunc('month',$1::date),date_trunc('month',$2::date),'1 month') m ON CONFLICT(period_month) DO NOTHING`,[startDate,endDate]);
    const periods=await manager.query<Array<{status:string}>>(`SELECT status FROM attendance_periods WHERE period_month BETWEEN date_trunc('month',$1::date) AND date_trunc('month',$2::date) ORDER BY period_month FOR UPDATE`,[startDate,endDate]);
    if (periods.some(p=>p.status==='LOCKED')) throw new ConflictException({code:'ATTENDANCE_PERIOD_LOCKED',message:'Kỳ công đã chốt; cần mở lại trước khi xử lý nghỉ phép.'});
  }
  private summary(item: LeaveRequestEntity): Record<string, unknown> {
    return { status: item.status, approvalStage: item.approvalStage, teamId: item.workflowTeamId, leaderUserId: item.leaderUserId, headUserId: item.headUserId, routeVersion: item.routeVersion, confirmedBy: item.confirmedBy, confirmedAt: item.confirmedAt, confirmationNote: item.confirmationNote, reviewedBy: item.reviewedBy, reviewedAt: item.reviewedAt, reviewNote: item.reviewNote };
  }
  private async audit(manager: EntityManager, userId: string, id: string, action: string, oldValue: unknown, newValue: unknown, reason?: string): Promise<void> {
    await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by) VALUES('LEAVE_REQUEST',$1,$2,$3::jsonb,$4::jsonb,$5)`, [id, action, oldValue == null ? null : JSON.stringify(oldValue), JSON.stringify({ ...newValue as object, ...(reason ? { reason } : {}) }), userId]);
  }
  private async notify(manager: EntityManager, pushes: Push[], actorId: string, userId: string | null, title: string, item: LeaveRequestEntity, detail: string): Promise<void> {
    if (!userId) return;
    const [recipient] = await manager.query<Array<{ id: string }>>(`SELECT e.id FROM employees e JOIN users u ON u.id=e.user_id WHERE u.id=$1 AND u.is_active AND e.is_active`, [userId]);
    if (!recipient) return;
    const repo = manager.getRepository(AnnouncementEntity);
    const announcement = await repo.save(repo.create({ title, body: `Đơn nghỉ phép ${item.id}\nKhoảng nghỉ: ${item.startDate} — ${item.endDate}\n${detail}\nMở mục Nghỉ phép để xem thông tin theo quyền hiện hành.`, status: 'PUBLISHED', audienceType: 'EMPLOYEE', employeeId: recipient.id, departmentId: null, requiresAcknowledgement: false, createdBy: actorId, publishedAt: new Date() }));
    await manager.query(`INSERT INTO announcement_recipients(announcement_id,employee_id) VALUES($1,$2)`, [announcement.id, recipient.id]);
    pushes.push({ announcement, employeeIds: [recipient.id] });
  }
  private async ownerUserId(manager: EntityManager, item: LeaveRequestEntity): Promise<string | null> {
    // Legacy submitted rows predate submitted_by; ownership is still employee_id.
    const [owner] = await manager.query<Array<{ userId: string | null }>>(`SELECT user_id AS "userId" FROM employees WHERE id=$1`, [item.employeeId]);
    return owner?.userId ?? null;
  }
  async deliver(pushes: Push[]): Promise<void> {
    // The inbox is committed first. Provider/transport failures cannot undo a decision.
    for (const push of pushes) {
      try { await this.announcements.deliverPublishedAnnouncementPush(push.announcement, push.employeeIds); }
      catch { this.logger.warn('Leave push unavailable; committed inbox retained.'); }
    }
  }
  private async notifyNext(manager: EntityManager, pushes: Push[], actorId: string, item: LeaveRequestEntity): Promise<void> {
    if (item.approvalStage === 'LEADER_CONFIRMATION') await this.notify(manager, pushes, actorId, item.leaderUserId, 'Nghỉ phép cần Leader xác nhận', item, 'Bạn được chỉ định xác nhận bước 1.');
    else if (item.approvalStage === 'HEAD_APPROVAL') await this.notify(manager, pushes, actorId, item.headUserId, 'Nghỉ phép chờ Trưởng phòng duyệt', item, 'Leader đã xác nhận. Bạn được chỉ định xử lý bước 2.');
    else if (item.approvalStage === 'WAITING_ROUTING') {
      const admins = await manager.query<Array<{ id: string }>>(`SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='ADMIN' AND u.is_active`);
      for (const admin of admins) await this.notify(manager, pushes, actorId, admin.id, 'Nghỉ phép cần Admin phân tuyến', item, 'Đơn đã tiếp nhận nhưng chưa có tuyến hợp lệ. Không bỏ qua bước xác nhận.');
    }
  }
  async initialize(manager: EntityManager, item: LeaveRequestEntity, actorId: string, pushes: Push[]): Promise<LeaveRequestEntity> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`leave-route:${item.employeeId}`]);
    const [defaultRoute] = await manager.query<Route[]>(`SELECT employee_id AS "employeeId",team_id AS "teamId",leader_user_id AS "leaderUserId",head_user_id AS "headUserId",version FROM leave_approval_routes WHERE employee_id=$1`, [item.employeeId]);
    // Leave defaults are independent snapshots; never read explanation routing here.
    const route = item.workflowTeamId && item.leaderUserId && item.headUserId
      ? { teamId: item.workflowTeamId, leaderUserId: item.leaderUserId, headUserId: item.headUserId }
      : defaultRoute;
    item.approvalStage = 'WAITING_ROUTING';
    item.routeVersion = (item.routeVersion ?? 0) + 1;
    item.workflowTeamId = null; item.leaderUserId = null; item.headUserId = null;
    if (route) {
      const team = await this.team(manager, route.teamId);
      const grants = await readManagementGrants(manager);
      const [owner] = await manager.query<Array<{userId:string}>>('SELECT user_id AS "userId" FROM employees WHERE id=$1',[item.employeeId]);
      if (independentReviewers(owner?.userId ?? null, route.leaderUserId, route.headUserId) && independentReviewers(item.submittedBy ?? null, route.leaderUserId, route.headUserId) && await this.eligibleMember(manager, item.employeeId, route.teamId)
        && hasWorkflowGrant(grants, route.leaderUserId, 'TEAM_LEADER', team, new Date()) && hasWorkflowGrant(grants, route.headUserId, 'DEPARTMENT_HEAD', team, new Date())) {
        item.workflowTeamId = route.teamId; item.leaderUserId = route.leaderUserId; item.headUserId = route.headUserId; item.approvalStage = 'LEADER_CONFIRMATION';
      }
    }
    await manager.save(item);
    await this.audit(manager, actorId, item.id, 'WORKFLOW_START', null, this.summary(item));
    await this.notifyNext(manager, pushes, actorId, item);
    return item;
  }

  async list(user: AuthenticatedUserView, mine = false): Promise<unknown[]> {
    if (mine && !user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const admin = !mine && user.roles.includes(RoleCode.Admin);
    const grants = await readManagementGrants(this.db.manager);
    if (!admin && !mine && !grants.some(g => g.userId === user.id && grantStatus(g, new Date()) === 'ACTIVE'))
      throw new ForbiddenException({ code: 'LEAVE_SCOPE_REQUIRED', message: 'Không có quyền quản lý nghỉ phép hiện hành.' });
    const rows = await this.db.query<LeaveView[]>(`SELECT x.id,x.employee_id AS "employeeId",x.submitted_by AS "submittedBy",x.status,
      x.start_date::text AS "startDate",x.end_date::text AS "endDate",x.reason,x.policy_id AS "policyId",p.name AS "policyName",
      x.leave_type AS "leaveType",x.duration_type AS "durationType",x.half_day_period AS "halfDayPeriod",x.start_time::text AS "startTime",x.end_time::text AS "endTime",
      x.requested_minutes AS "requestedMinutes",p.day_minutes AS "dayMinutes",p.allow_approved_cancellation AS "allowApprovedCancellation",
      x.submitted_at AS "submittedAt",COALESCE(se.full_name,su.email) AS "submittedByName",x.reviewed_by AS "reviewedBy",
      x.reviewed_at AS "reviewedAt",x.review_note AS "reviewNote",x.cancelled_at AS "cancelledAt",x.cancellation_reason AS "cancellationReason",
      x.approval_stage AS "approvalStage",x.workflow_team_id AS "workflowTeamId",x.leader_user_id AS "leaderUserId",x.head_user_id AS "headUserId",x.route_version AS "routeVersion",
      x.confirmed_by AS "confirmedBy",x.confirmed_at AS "confirmedAt",x.confirmation_note AS "confirmationNote",
      e.employee_code AS "employeeCode",e.full_name AS "fullName",e.full_name AS "employeeName",t.name AS "teamName",t.department_id AS "departmentId",
      (t.is_active AND d.is_active) AS "teamActive",d.name AS "departmentName",le.full_name AS "leaderName",he.full_name AS "headName",ce.full_name AS "confirmedByName",re.full_name AS "reviewedByName"
      FROM leave_requests x JOIN employees e ON e.id=x.employee_id JOIN leave_policies p ON p.id=x.policy_id
      LEFT JOIN organization_teams t ON t.id=x.workflow_team_id LEFT JOIN departments d ON d.id=t.department_id
      LEFT JOIN users su ON su.id=x.submitted_by LEFT JOIN employees se ON se.user_id=su.id
      LEFT JOIN employees le ON le.user_id=x.leader_user_id LEFT JOIN employees he ON he.user_id=x.head_user_id
      LEFT JOIN employees ce ON ce.user_id=x.confirmed_by LEFT JOIN employees re ON re.user_id=x.reviewed_by
      WHERE ($1::boolean OR CASE WHEN $2::boolean THEN x.employee_id=$3::uuid ELSE x.leader_user_id=$4::uuid OR x.head_user_id=$4::uuid END)
      ORDER BY CASE WHEN x.status='SUBMITTED' THEN 0 ELSE 1 END,x.submitted_at DESC`,
      [admin,mine,user.employeeId ?? null,user.id]);
    return rows.flatMap(item => {
      const permissions = workflowPermissions(item,user.id,user.employeeId,grants,item.workflowTeamId && item.departmentId ? {id:item.workflowTeamId,departmentId:item.departmentId,isActive:Boolean(item.teamActive)} : null,new Date());
      if (!admin && !mine && !permissions.canRead) return [];
      const {teamActive: _active,departmentId: _department,...view}=item; void _active;
      return [{...view,workflowDepartmentId:_department,approvalStage:permissions.routingRequired ? 'WAITING_ROUTING' : item.approvalStage,
        canConfirm:!mine && permissions.canConfirm,canReview:!mine && permissions.canReview,canReroute:admin && item.status==='SUBMITTED',routingRequired:permissions.routingRequired}];
    });
  }
  async history(user: AuthenticatedUserView, id: string): Promise<unknown[]> {
    const item = await this.db.getRepository(LeaveRequestEntity).findOneBy({ id });
    if (!item) this.missing();
    if (!user.roles.includes(RoleCode.Admin) && item.employeeId !== user.employeeId && !workflowPermissions(item, user.id, user.employeeId, await readManagementGrants(this.db.manager, user.id), await this.team(this.db.manager, item.workflowTeamId), new Date()).canRead) this.missing();
    return this.db.query(`SELECT l.id,l.action,l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='LEAVE_REQUEST' AND l.resource_id=$1 ORDER BY l.created_at,l.id`, [id]);
  }
  async process(user: AuthenticatedUserView, id: string, input: ConfirmLeaveRequestDto | ReviewLeaveRequestDto, confirm: boolean, beforeApproval?: (manager: EntityManager, request: LeaveRequestEntity) => Promise<void>): Promise<LeaveRequestEntity> {
    const pushes: Push[] = [];
    const saved = await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveRequestEntity);
      const initial = await repo.findOneBy({ id }); if (!initial) this.missing();
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`leave-route:${initial.employeeId}`]);
      await this.periodOpen(manager, initial.startDate, initial.endDate);
      const item = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } }); if (!item) this.missing();
      this.stale(item.routeVersion, input.expectedVersion);
      const permissions = workflowPermissions(item, user.id, user.employeeId, await readManagementGrants(manager), await this.team(manager, item.workflowTeamId), new Date());
      if (confirm ? !permissions.canConfirm : !permissions.canReview) throw new ForbiddenException({ code: 'LEAVE_STEP_FORBIDDEN', message: 'Không được xử lý bước này. Kiểm tra tuyến, thứ tự bước và quyền hiện hành; Admin không duyệt thay.' });
      if (!confirm && (input as ReviewLeaveRequestDto).status === 'APPROVED') await beforeApproval?.(manager,item);
      const old = this.summary(item);
      if (confirm) {
        item.confirmedBy = user.id; item.confirmedAt = new Date(); item.confirmationNote = (input as ConfirmLeaveRequestDto).confirmationNote?.trim() || null; item.approvalStage = 'HEAD_APPROVAL';
      } else {
        item.status = (input as ReviewLeaveRequestDto).status; item.reviewNote = (input as ReviewLeaveRequestDto).reviewNote?.trim() || null; item.reviewedBy = user.id; item.reviewedAt = new Date(); item.approvalStage = 'COMPLETED';
      }
      item.routeVersion++;
      await repo.save(item);
      await this.audit(manager, user.id, id, confirm ? 'LEADER_CONFIRM' : 'HEAD_REVIEW', old, this.summary(item));
      if (confirm) await this.notifyNext(manager, pushes, user.id, item);
      await this.notify(manager, pushes, user.id, await this.ownerUserId(manager, item), confirm ? 'Nghỉ phép đã được Leader xác nhận' : item.status === 'APPROVED' ? 'Nghỉ phép đã được duyệt' : 'Nghỉ phép bị từ chối', item, confirm ? 'Đơn chuyển sang Trưởng phòng duyệt.' : `Quyết định: ${item.status === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}.${item.reviewNote ? `\nGhi chú: ${item.reviewNote}` : ''}`);
      return item;
    });
    await this.deliver(pushes); return saved;
  }
  private async applyRoute(manager: EntityManager, item: LeaveRequestEntity, input: SetLeaveRouteDto, user: AuthenticatedUserView, pushes: Push[]): Promise<void> {
    if (!['SUBMITTED'].includes(item.status)) throw new ConflictException({ code: 'LEAVE_ALREADY_COMPLETED', message: 'Không đổi tuyến của đơn đã kết thúc.' });
    if (item.confirmedBy && (item.workflowTeamId !== input.teamId || item.leaderUserId !== input.leaderUserId)) throw new ConflictException({ code: 'LEAVE_CONFIRMED_STEP_IMMUTABLE', message: 'Leader đã xác nhận; chỉ được thay Trưởng phòng trong phòng đã chốt, không sửa bước hoàn tất.' });
    await this.periodOpen(manager,item.startDate,item.endDate);
    await this.validateRoute(manager, item.employeeId, input, item.confirmedBy, item.submittedBy);
    const old = this.summary(item);
    item.workflowTeamId = input.teamId; item.leaderUserId = input.leaderUserId; item.headUserId = input.headUserId; item.routeVersion++;
    item.approvalStage = item.confirmedBy ? 'HEAD_APPROVAL' : 'LEADER_CONFIRMATION';
    await manager.save(item);
    await this.audit(manager, user.id, item.id, 'ADMIN_REROUTE', old, this.summary(item), input.reason.trim());
    await this.notifyNext(manager, pushes, user.id, item);
    await this.notify(manager, pushes, user.id, await this.ownerUserId(manager, item), 'Tuyến nghỉ phép được cập nhật', item, 'Admin đã cập nhật bước chưa xử lý. Lịch sử xác nhận đã hoàn tất được giữ nguyên.');
  }
  async reroute(user: AuthenticatedUserView, id: string, input: SetLeaveRouteDto): Promise<LeaveRequestEntity> {
    this.admin(user); const pushes: Push[] = [];
    const saved = await this.db.transaction(async (manager) => {
      const initial = await manager.getRepository(LeaveRequestEntity).findOneBy({ id }); if (!initial) this.missing();
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`leave-route:${initial.employeeId}`]);
      const item = await manager.getRepository(LeaveRequestEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } }); if (!item) this.missing();
      this.stale(item.routeVersion, input.expectedVersion);
      await this.applyRoute(manager, item, input, user, pushes); return item;
    });
    await this.deliver(pushes); return saved;
  }
  async routes(user: AuthenticatedUserView): Promise<unknown[]> {
    this.admin(user);
    return this.db.query(`SELECT r.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",r.team_id AS "teamId",t.name AS "teamName",r.leader_user_id AS "leaderUserId",le.full_name AS "leaderName",r.head_user_id AS "headUserId",he.full_name AS "headName",r.version,r.reason,r.updated_at AS "updatedAt" FROM leave_approval_routes r JOIN employees e ON e.id=r.employee_id JOIN organization_teams t ON t.id=r.team_id JOIN employees le ON le.user_id=r.leader_user_id JOIN employees he ON he.user_id=r.head_user_id ORDER BY e.full_name`);
  }
  async routingOptions(user: AuthenticatedUserView): Promise<unknown> {
    this.admin(user);
    const grants = (await readManagementGrants(this.db.manager)).filter((g) => grantStatus(g, new Date()) === 'ACTIVE').map((g) => ({ userId: g.userId, employeeId: g.employeeId, name: g.employeeName, roleCode: g.roleCode, teamId: g.teamId, departmentId: g.departmentId }));
    const members = await this.db.query<Array<{ employeeId: string; userId: string; employeeCode: string; fullName: string; teamId: string; teamName: string; departmentId: string; departmentName: string }>>(`SELECT DISTINCT e.id AS "employeeId",e.user_id AS "userId",e.employee_code AS "employeeCode",e.full_name AS "fullName",t.id AS "teamId",t.name AS "teamName",t.department_id AS "departmentId",d.name AS "departmentName" FROM organization_team_memberships m JOIN organization_teams t ON t.id=m.team_id JOIN departments d ON d.id=t.department_id JOIN employees e ON e.id=m.employee_id JOIN users u ON u.id=e.user_id WHERE m.ended_at IS NULL AND t.is_active AND d.is_active AND e.is_active AND u.is_active AND EXISTS(SELECT 1 FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id WHERE a.employee_id=e.id AND a.department_id=t.department_id AND b.is_active AND a.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (a.effective_to IS NULL OR a.effective_to >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) ORDER BY e.full_name`);
    return { grants, members };
  }
  async setDefaultRoute(user: AuthenticatedUserView, employeeId: string, input: SetLeaveRouteDto): Promise<unknown> {
    this.admin(user); const pushes: Push[] = [];
    const result = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`leave-route:${employeeId}`]);
      const [old] = await manager.query<Route[]>(`SELECT employee_id AS "employeeId",team_id AS "teamId",leader_user_id AS "leaderUserId",head_user_id AS "headUserId",version FROM leave_approval_routes WHERE employee_id=$1 FOR UPDATE`, [employeeId]);
      this.stale(old?.version ?? 0, input.expectedVersion);
      await this.validateRoute(manager, employeeId, input);
      // Batch updates lock every affected month in one order, even when request IDs
      // have different date orders. Per-employee advisory lock keeps this set stable.
      await manager.query(`INSERT INTO attendance_periods(period_month,status)
        SELECT DISTINCT m::date,'OPEN' FROM leave_requests x CROSS JOIN LATERAL
        generate_series(date_trunc('month',x.start_date),date_trunc('month',x.end_date),'1 month') m
        WHERE x.employee_id=$1 AND x.status='SUBMITTED' ORDER BY m::date
        ON CONFLICT(period_month) DO NOTHING`, [employeeId]);
      const periods=await manager.query<Array<{status:string}>>(`SELECT p.status FROM attendance_periods p
        WHERE EXISTS(SELECT 1 FROM leave_requests x WHERE x.employee_id=$1 AND x.status='SUBMITTED'
          AND p.period_month BETWEEN date_trunc('month',x.start_date) AND date_trunc('month',x.end_date))
        ORDER BY p.period_month FOR UPDATE`, [employeeId]);
      if (periods.some(p=>p.status==='LOCKED')) throw new ConflictException({code:'ATTENDANCE_PERIOD_LOCKED',message:'Có đơn đang mở trong kỳ đã chốt; cần mở lại trước khi đổi tuyến.'});
      const items = await manager.getRepository(LeaveRequestEntity).createQueryBuilder('x').where('x.employee_id = :employeeId AND x.status IN (:...statuses)', { employeeId, statuses: ['SUBMITTED'] }).orderBy('x.id').setLock('pessimistic_write').getMany();
      for (const item of items) {
        // Completed step keeps its original team and Leader even if the future default changes.
        await this.applyRoute(manager, item, item.confirmedBy ? { ...input, teamId: item.workflowTeamId!, leaderUserId: item.leaderUserId! } : input, user, pushes);
      }
      const [route] = await manager.query<Array<{ version: number }>>(`INSERT INTO leave_approval_routes(employee_id,team_id,leader_user_id,head_user_id,reason,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(employee_id) DO UPDATE SET team_id=EXCLUDED.team_id,leader_user_id=EXCLUDED.leader_user_id,head_user_id=EXCLUDED.head_user_id,reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,version=leave_approval_routes.version+1,updated_at=now() RETURNING version`, [employeeId, input.teamId, input.leaderUserId, input.headUserId, input.reason.trim(), user.id]);
      await this.audit(manager, user.id, employeeId, 'SET_DEFAULT_ROUTE', old ?? null, { teamId: input.teamId, leaderUserId: input.leaderUserId, headUserId: input.headUserId, version: route.version, updatedPending: items.length }, input.reason.trim());
      return { version: route.version, updatedPending: items.length };
    });
    await this.deliver(pushes); return result;
  }
}
