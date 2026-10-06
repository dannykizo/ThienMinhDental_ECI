import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { AnnouncementEntity, AttendanceExplanationEntity } from '../../../database/entities/workforce.entity.js';
import { AnnouncementsService } from '../../announcements/announcements.service.js';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { grantStatus } from '../../organization-access/domain/management-access.js';
import { readManagementGrants } from '../../organization-access/infrastructure/management-grant.reader.js';
import type { ConfirmAttendanceExplanationDto, ReviewAttendanceExplanationDto, SetExplanationRouteDto } from '../attendance.dto.js';
import { hasWorkflowGrant, independentReviewers, workflowPermissions, type WorkflowTeam } from '../domain/explanation-workflow.js';
import { validExplanationDate } from '../domain/explanation-policy.js';

interface Route { employeeId: string; teamId: string; leaderUserId: string; headUserId: string; version: number; }
type ExplanationView = AttendanceExplanationEntity & { employeeCode: string; fullName: string; teamName: string | null; departmentName: string | null; leaderName: string | null; headName: string | null; confirmedByName: string | null; reviewedByName: string | null; departmentId: string | null; teamActive: boolean | null; };
type Push = { announcement: AnnouncementEntity; employeeIds: string[] };

@Injectable()
export class ExplanationWorkflowService {
  private readonly logger = new Logger(ExplanationWorkflowService.name);
  constructor(@InjectDataSource() private readonly db: DataSource, private readonly announcements: AnnouncementsService) {}

  private admin(user: AuthenticatedUserView): void {
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'EXPLANATION_ADMIN_REQUIRED', message: 'Chỉ Admin được cấu hình hoặc đổi tuyến.' });
  }
  private missing(): never { throw new NotFoundException({ code: 'EXPLANATION_NOT_FOUND', message: 'Không tìm thấy đơn giải trình trong phạm vi.' }); }
  private stale(actual: number, expected: number): void {
    if (actual !== expected) throw new ConflictException({ code: 'EXPLANATION_ROUTE_CHANGED', message: 'Đơn hoặc tuyến đã thay đổi. Hãy tải lại trước khi thao tác.' });
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
  private async validateRoute(manager: EntityManager, employeeId: string, input: SetExplanationRouteDto, confirmedBy: string | null = null, ownerId?: string | null): Promise<void> {
    if (input.reason.trim().length < 5) throw new BadRequestException({ code: 'EXPLANATION_ROUTE_REASON_REQUIRED', message: 'Lý do cấu hình hoặc đổi tuyến cần ít nhất 5 ký tự.' });
    const [employee] = await manager.query<Array<{ userId: string | null }>>(`SELECT user_id AS "userId" FROM employees WHERE id=$1`, [employeeId]);
    if (!employee || !independentReviewers(ownerId ?? employee.userId, input.leaderUserId, input.headUserId, confirmedBy)) throw new BadRequestException({ code: 'EXPLANATION_INDEPENDENT_REVIEWERS_REQUIRED', message: 'Leader và Trưởng phòng phải khác nhau, không là người gửi hoặc người đã xác nhận.' });
    const team = await this.team(manager, input.teamId);
    const grants = await readManagementGrants(manager);
    if ((!confirmedBy && (!await this.eligibleMember(manager, employeeId, input.teamId) || !hasWorkflowGrant(grants, input.leaderUserId, 'TEAM_LEADER', team, new Date())))
      || !hasWorkflowGrant(grants, input.headUserId, 'DEPARTMENT_HEAD', team, new Date())) throw new BadRequestException({ code: 'EXPLANATION_ROUTE_INELIGIBLE', message: 'Team/thành viên hoặc quyền xử lý không còn hợp lệ trong phạm vi đã chọn.' });
  }
  private async periodOpen(manager: EntityManager, date: string): Promise<void> {
    await manager.query(`INSERT INTO attendance_periods(period_month,status) VALUES(date_trunc('month',$1::date)::date,'OPEN') ON CONFLICT(period_month) DO NOTHING`, [date]);
    const [period] = await manager.query<Array<{ status: string }>>(`SELECT status FROM attendance_periods WHERE period_month=date_trunc('month',$1::date)::date FOR UPDATE`, [date]);
    if (period.status === 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: 'Kỳ công đã chốt; cần mở lại trước khi xử lý giải trình.' });
  }
  private summary(item: AttendanceExplanationEntity): Record<string, unknown> {
    return { status: item.status, approvalStage: item.approvalStage, teamId: item.workflowTeamId, leaderUserId: item.leaderUserId, headUserId: item.headUserId, routeVersion: item.routeVersion, confirmedBy: item.confirmedBy, confirmedAt: item.confirmedAt, confirmationNote: item.confirmationNote, reviewedBy: item.reviewedBy, reviewedAt: item.reviewedAt, reviewNote: item.reviewNote };
  }
  private async audit(manager: EntityManager, userId: string, id: string, action: string, oldValue: unknown, newValue: unknown, reason?: string): Promise<void> {
    await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by) VALUES('ATTENDANCE_EXPLANATION',$1,$2,$3::jsonb,$4::jsonb,$5)`, [id, action, oldValue == null ? null : JSON.stringify(oldValue), JSON.stringify({ ...newValue as object, ...(reason ? { reason } : {}) }), userId]);
  }
  private async notify(manager: EntityManager, pushes: Push[], actorId: string, userId: string | null, title: string, item: AttendanceExplanationEntity, detail: string): Promise<void> {
    if (!userId) return;
    const [recipient] = await manager.query<Array<{ id: string }>>(`SELECT e.id FROM employees e JOIN users u ON u.id=e.user_id WHERE u.id=$1 AND u.is_active AND e.is_active`, [userId]);
    if (!recipient) return;
    const repo = manager.getRepository(AnnouncementEntity);
    const announcement = await repo.save(repo.create({ title, body: `Đơn giải trình ${item.id}\nNgày công: ${item.workDate}\n${detail}\nMở mục Giải trình để xem thông tin theo quyền hiện hành.`, status: 'PUBLISHED', audienceType: 'EMPLOYEE', employeeId: recipient.id, departmentId: null, requiresAcknowledgement: false, createdBy: actorId, publishedAt: new Date() }));
    await manager.query(`INSERT INTO announcement_recipients(announcement_id,employee_id) VALUES($1,$2)`, [announcement.id, recipient.id]);
    pushes.push({ announcement, employeeIds: [recipient.id] });
  }
  private async ownerUserId(manager: EntityManager, item: AttendanceExplanationEntity): Promise<string | null> {
    if (item.submittedBy) return item.submittedBy;
    // Legacy submitted rows predate submitted_by; ownership is still employee_id.
    const [owner] = await manager.query<Array<{ userId: string | null }>>(`SELECT user_id AS "userId" FROM employees WHERE id=$1`, [item.employeeId]);
    return owner?.userId ?? null;
  }
  async deliver(pushes: Push[]): Promise<void> {
    // The inbox is committed first. Provider/transport failures cannot undo a decision.
    for (const push of pushes) {
      try { await this.announcements.deliverPublishedAnnouncementPush(push.announcement, push.employeeIds); }
      catch { this.logger.warn('Explanation push unavailable; committed inbox retained.'); }
    }
  }
  private async notifyNext(manager: EntityManager, pushes: Push[], actorId: string, item: AttendanceExplanationEntity): Promise<void> {
    if (item.approvalStage === 'LEADER_CONFIRMATION') await this.notify(manager, pushes, actorId, item.leaderUserId, 'Giải trình cần Leader xác nhận', item, 'Bạn được chỉ định xác nhận bước 1.');
    else if (item.approvalStage === 'HEAD_APPROVAL') await this.notify(manager, pushes, actorId, item.headUserId, 'Giải trình chờ Trưởng phòng duyệt', item, 'Leader đã xác nhận. Bạn được chỉ định xử lý bước 2.');
    else if (item.approvalStage === 'WAITING_ROUTING') {
      const admins = await manager.query<Array<{ id: string }>>(`SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='ADMIN' AND u.is_active`);
      for (const admin of admins) await this.notify(manager, pushes, actorId, admin.id, 'Giải trình cần Admin phân tuyến', item, 'Đơn đã tiếp nhận nhưng chưa có tuyến hợp lệ. Không bỏ qua bước xác nhận.');
    }
  }
  async initialize(manager: EntityManager, item: AttendanceExplanationEntity, actorId: string, pushes: Push[]): Promise<AttendanceExplanationEntity> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`explanation-route:${item.employeeId}`]);
    const [defaultRoute] = await manager.query<Route[]>(`SELECT employee_id AS "employeeId",team_id AS "teamId",leader_user_id AS "leaderUserId",head_user_id AS "headUserId",version FROM attendance_explanation_routes WHERE employee_id=$1`, [item.employeeId]);
    // A legacy response must keep the explicit Admin route already assigned to that request.
    const route = item.workflowTeamId && item.leaderUserId && item.headUserId
      ? { teamId: item.workflowTeamId, leaderUserId: item.leaderUserId, headUserId: item.headUserId }
      : defaultRoute;
    item.approvalStage = 'WAITING_ROUTING';
    item.routeVersion = (item.routeVersion ?? 0) + 1;
    item.workflowTeamId = null; item.leaderUserId = null; item.headUserId = null;
    if (route) {
      const team = await this.team(manager, route.teamId);
      const grants = await readManagementGrants(manager);
      if (independentReviewers(item.submittedBy, route.leaderUserId, route.headUserId) && await this.eligibleMember(manager, item.employeeId, route.teamId)
        && hasWorkflowGrant(grants, route.leaderUserId, 'TEAM_LEADER', team, new Date()) && hasWorkflowGrant(grants, route.headUserId, 'DEPARTMENT_HEAD', team, new Date())) {
        item.workflowTeamId = route.teamId; item.leaderUserId = route.leaderUserId; item.headUserId = route.headUserId; item.approvalStage = 'LEADER_CONFIRMATION';
      }
    }
    await manager.save(item);
    await this.audit(manager, actorId, item.id, 'WORKFLOW_START', null, this.summary(item));
    await this.notifyNext(manager, pushes, actorId, item);
    return item;
  }

  async list(user: AuthenticatedUserView, date?: string, mine = false): Promise<unknown[]> {
    if (date && !validExplanationDate(date)) throw new BadRequestException({ code: 'INVALID_EXPLANATION_DATE', message: 'Ngày lọc phải có định dạng YYYY-MM-DD hợp lệ.' });
    if (mine && !user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const admin = !mine && user.roles.includes(RoleCode.Admin);
    const rows = await this.db.query<ExplanationView[]>(`SELECT x.id,x.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",x.work_date::text AS "workDate",x.issue_type AS "issueType",x.source,x.request_note AS "requestNote",x.status,x.due_at AS "dueAt",x.response_text AS "responseText",x.evidence_image_reference AS "evidenceImageReference",x.evidence_captured_at AS "evidenceCapturedAt",x.review_note AS "reviewNote",x.reviewed_at AS "reviewedAt",x.reviewed_by AS "reviewedBy",x.submitted_by AS "submittedBy",x.created_at AS "createdAt",x.approval_stage AS "approvalStage",x.workflow_team_id AS "workflowTeamId",x.leader_user_id AS "leaderUserId",x.head_user_id AS "headUserId",x.route_version AS "routeVersion",x.confirmed_by AS "confirmedBy",x.confirmed_at AS "confirmedAt",x.confirmation_note AS "confirmationNote",x.attendance_event_id AS "attendanceEventId",x.requested_by AS "requestedBy",x.submission_id AS "submissionId",x.evidence_latitude AS "evidenceLatitude",x.evidence_longitude AS "evidenceLongitude",x.updated_at AS "updatedAt",t.name AS "teamName",t.department_id AS "departmentId",(t.is_active AND d.is_active) AS "teamActive",d.name AS "departmentName",le.full_name AS "leaderName",he.full_name AS "headName",ce.full_name AS "confirmedByName",COALESCE(re.full_name,ru.email) AS "reviewedByName"
      FROM attendance_explanation_requests x JOIN employees e ON e.id=x.employee_id LEFT JOIN organization_teams t ON t.id=x.workflow_team_id LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN employees le ON le.user_id=x.leader_user_id LEFT JOIN employees he ON he.user_id=x.head_user_id LEFT JOIN employees ce ON ce.user_id=x.confirmed_by LEFT JOIN users ru ON ru.id=x.reviewed_by LEFT JOIN employees re ON re.user_id=ru.id
      WHERE ($1::date IS NULL OR x.work_date=$1::date) AND ($2::boolean OR CASE WHEN $4::boolean THEN x.employee_id=$5::uuid ELSE (x.leader_user_id=$3::uuid OR x.head_user_id=$3::uuid) END)
      ORDER BY ${mine ? '' : "CASE WHEN x.status IN ('REQUESTED','SUBMITTED') THEN 0 ELSE 1 END,"}x.created_at DESC ${mine ? 'LIMIT 100' : ''}`, [date ?? null, admin, user.id, mine, user.employeeId ?? null]);
    const grants = await readManagementGrants(this.db.manager);
    if (!admin && !mine && !grants.some((g) => g.userId === user.id && grantStatus(g, new Date()) === 'ACTIVE')) throw new ForbiddenException({ code: 'EXPLANATION_SCOPE_REQUIRED', message: 'Không có quyền quản lý giải trình hiện hành.' });
    return rows.flatMap((item) => {
      const team = item.workflowTeamId && item.departmentId ? { id: item.workflowTeamId, departmentId: item.departmentId, isActive: Boolean(item.teamActive) } : null;
      const permissions = workflowPermissions(item, user.id, user.employeeId, grants, team, new Date());
      if (!admin && !mine && !permissions.canRead) return [];
      // Internal eligibility metadata never leaves this API.
      const { teamActive: _teamActive, departmentId: _departmentId, ...view } = item; void _teamActive; void _departmentId;
      return [{ ...view, workflowDepartmentId: _departmentId, approvalStage: permissions.routingRequired ? 'WAITING_ROUTING' : item.approvalStage, pendingStep: item.confirmedBy ? 'HEAD_APPROVAL' : 'LEADER_CONFIRMATION', canConfirm: !mine && permissions.canConfirm, canReview: !mine && permissions.canReview, canReroute: admin && ['REQUESTED', 'SUBMITTED'].includes(item.status), routingRequired: permissions.routingRequired }];
    });
  }
  async canReadEvidence(user: AuthenticatedUserView, filename: string): Promise<boolean> {
    const rows = await this.db.getRepository(AttendanceExplanationEntity).find({ where: { evidenceImageReference: `/api/attendance/evidence/${filename}` } });
    const grants = await readManagementGrants(this.db.manager, user.id);
    for (const item of rows) if (workflowPermissions(item, user.id, user.employeeId, grants, await this.team(this.db.manager, item.workflowTeamId), new Date()).canRead) return true;
    return false;
  }
  async history(user: AuthenticatedUserView, id: string): Promise<unknown[]> {
    const item = await this.db.getRepository(AttendanceExplanationEntity).findOneBy({ id });
    if (!item) this.missing();
    if (!user.roles.includes(RoleCode.Admin) && item.employeeId !== user.employeeId && !workflowPermissions(item, user.id, user.employeeId, await readManagementGrants(this.db.manager, user.id), await this.team(this.db.manager, item.workflowTeamId), new Date()).canRead) this.missing();
    return this.db.query(`SELECT l.id,l.action,l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='ATTENDANCE_EXPLANATION' AND l.resource_id=$1 ORDER BY l.created_at,l.id`, [id]);
  }
  async process(user: AuthenticatedUserView, id: string, input: ConfirmAttendanceExplanationDto | ReviewAttendanceExplanationDto, confirm: boolean): Promise<AttendanceExplanationEntity> {
    const pushes: Push[] = [];
    const saved = await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(AttendanceExplanationEntity);
      const initial = await repo.findOneBy({ id }); if (!initial) this.missing();
      await this.periodOpen(manager, initial.workDate);
      const item = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } }); if (!item) this.missing();
      this.stale(item.routeVersion, input.expectedVersion);
      const permissions = workflowPermissions(item, user.id, user.employeeId, await readManagementGrants(manager), await this.team(manager, item.workflowTeamId), new Date());
      if (confirm ? !permissions.canConfirm : !permissions.canReview) throw new ForbiddenException({ code: 'EXPLANATION_STEP_FORBIDDEN', message: 'Không được xử lý bước này. Kiểm tra tuyến, thứ tự bước và quyền hiện hành; Admin không duyệt thay.' });
      const old = this.summary(item);
      if (confirm) {
        item.confirmedBy = user.id; item.confirmedAt = new Date(); item.confirmationNote = (input as ConfirmAttendanceExplanationDto).confirmationNote?.trim() || null; item.approvalStage = 'HEAD_APPROVAL';
      } else {
        item.status = (input as ReviewAttendanceExplanationDto).status; item.reviewNote = (input as ReviewAttendanceExplanationDto).reviewNote?.trim() || null; item.reviewedBy = user.id; item.reviewedAt = new Date(); item.approvalStage = 'COMPLETED';
      }
      item.routeVersion++;
      await repo.save(item);
      await this.audit(manager, user.id, id, confirm ? 'LEADER_CONFIRM' : 'HEAD_REVIEW', old, this.summary(item));
      if (confirm) await this.notifyNext(manager, pushes, user.id, item);
      await this.notify(manager, pushes, user.id, await this.ownerUserId(manager, item), confirm ? 'Giải trình đã được Leader xác nhận' : item.status === 'APPROVED' ? 'Giải trình đã được duyệt' : 'Giải trình bị từ chối', item, confirm ? 'Đơn chuyển sang Trưởng phòng duyệt.' : `Quyết định: ${item.status === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}.${item.reviewNote ? `\nGhi chú: ${item.reviewNote}` : ''}\nDuyệt giải trình không tự điều chỉnh bảng công.`);
      return item;
    });
    await this.deliver(pushes); return saved;
  }
  private async applyRoute(manager: EntityManager, item: AttendanceExplanationEntity, input: SetExplanationRouteDto, user: AuthenticatedUserView, pushes: Push[]): Promise<void> {
    if (!['REQUESTED', 'SUBMITTED'].includes(item.status)) throw new ConflictException({ code: 'EXPLANATION_ALREADY_COMPLETED', message: 'Không đổi tuyến của đơn đã kết thúc.' });
    if (item.confirmedBy && (item.workflowTeamId !== input.teamId || item.leaderUserId !== input.leaderUserId)) throw new ConflictException({ code: 'EXPLANATION_CONFIRMED_STEP_IMMUTABLE', message: 'Leader đã xác nhận; chỉ được thay Trưởng phòng trong phòng đã chốt, không sửa bước hoàn tất.' });
    await this.validateRoute(manager, item.employeeId, input, item.confirmedBy, item.submittedBy);
    const old = this.summary(item);
    item.workflowTeamId = input.teamId; item.leaderUserId = input.leaderUserId; item.headUserId = input.headUserId; item.routeVersion++;
    item.approvalStage = item.status === 'REQUESTED' ? 'EMPLOYEE_RESPONSE' : item.confirmedBy ? 'HEAD_APPROVAL' : 'LEADER_CONFIRMATION';
    await manager.save(item);
    await this.audit(manager, user.id, item.id, 'ADMIN_REROUTE', old, this.summary(item), input.reason.trim());
    await this.notifyNext(manager, pushes, user.id, item);
    await this.notify(manager, pushes, user.id, await this.ownerUserId(manager, item), 'Tuyến giải trình được cập nhật', item, 'Admin đã cập nhật bước chưa xử lý. Lịch sử xác nhận đã hoàn tất được giữ nguyên.');
  }
  async reroute(user: AuthenticatedUserView, id: string, input: SetExplanationRouteDto): Promise<AttendanceExplanationEntity> {
    this.admin(user); const pushes: Push[] = [];
    const saved = await this.db.transaction(async (manager) => {
      const item = await manager.getRepository(AttendanceExplanationEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } }); if (!item) this.missing();
      this.stale(item.routeVersion, input.expectedVersion);
      await this.applyRoute(manager, item, input, user, pushes); return item;
    });
    await this.deliver(pushes); return saved;
  }
  async routes(user: AuthenticatedUserView): Promise<unknown[]> {
    this.admin(user);
    return this.db.query(`SELECT r.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",r.team_id AS "teamId",t.name AS "teamName",r.leader_user_id AS "leaderUserId",le.full_name AS "leaderName",r.head_user_id AS "headUserId",he.full_name AS "headName",r.version,r.reason,r.updated_at AS "updatedAt" FROM attendance_explanation_routes r JOIN employees e ON e.id=r.employee_id JOIN organization_teams t ON t.id=r.team_id JOIN employees le ON le.user_id=r.leader_user_id JOIN employees he ON he.user_id=r.head_user_id ORDER BY e.full_name`);
  }
  async routingOptions(user: AuthenticatedUserView): Promise<unknown> {
    this.admin(user);
    const grants = (await readManagementGrants(this.db.manager)).filter((g) => grantStatus(g, new Date()) === 'ACTIVE').map((g) => ({ userId: g.userId, employeeId: g.employeeId, name: g.employeeName, roleCode: g.roleCode, teamId: g.teamId, departmentId: g.departmentId }));
    const members = await this.db.query<Array<{ employeeId: string; userId: string; employeeCode: string; fullName: string; teamId: string; teamName: string; departmentId: string; departmentName: string }>>(`SELECT DISTINCT e.id AS "employeeId",e.user_id AS "userId",e.employee_code AS "employeeCode",e.full_name AS "fullName",t.id AS "teamId",t.name AS "teamName",t.department_id AS "departmentId",d.name AS "departmentName" FROM organization_team_memberships m JOIN organization_teams t ON t.id=m.team_id JOIN departments d ON d.id=t.department_id JOIN employees e ON e.id=m.employee_id JOIN users u ON u.id=e.user_id WHERE m.ended_at IS NULL AND t.is_active AND d.is_active AND e.is_active AND u.is_active AND EXISTS(SELECT 1 FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id WHERE a.employee_id=e.id AND a.department_id=t.department_id AND b.is_active AND a.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (a.effective_to IS NULL OR a.effective_to >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) ORDER BY e.full_name`);
    return { grants, members };
  }
  async setDefaultRoute(user: AuthenticatedUserView, employeeId: string, input: SetExplanationRouteDto): Promise<unknown> {
    this.admin(user); const pushes: Push[] = [];
    const result = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`explanation-route:${employeeId}`]);
      const [old] = await manager.query<Route[]>(`SELECT employee_id AS "employeeId",team_id AS "teamId",leader_user_id AS "leaderUserId",head_user_id AS "headUserId",version FROM attendance_explanation_routes WHERE employee_id=$1 FOR UPDATE`, [employeeId]);
      this.stale(old?.version ?? 0, input.expectedVersion);
      await this.validateRoute(manager, employeeId, input);
      const items = await manager.getRepository(AttendanceExplanationEntity).createQueryBuilder('x').where('x.employee_id = :employeeId AND x.status IN (:...statuses)', { employeeId, statuses: ['REQUESTED', 'SUBMITTED'] }).orderBy('x.id').setLock('pessimistic_write').getMany();
      for (const item of items) {
        // Completed step keeps its original team and Leader even if the future default changes.
        await this.applyRoute(manager, item, item.confirmedBy ? { ...input, teamId: item.workflowTeamId!, leaderUserId: item.leaderUserId! } : input, user, pushes);
      }
      const [route] = await manager.query<Array<{ version: number }>>(`INSERT INTO attendance_explanation_routes(employee_id,team_id,leader_user_id,head_user_id,reason,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(employee_id) DO UPDATE SET team_id=EXCLUDED.team_id,leader_user_id=EXCLUDED.leader_user_id,head_user_id=EXCLUDED.head_user_id,reason=EXCLUDED.reason,updated_by=EXCLUDED.updated_by,version=attendance_explanation_routes.version+1,updated_at=now() RETURNING version`, [employeeId, input.teamId, input.leaderUserId, input.headUserId, input.reason.trim(), user.id]);
      await this.audit(manager, user.id, employeeId, 'SET_DEFAULT_ROUTE', old ?? null, { teamId: input.teamId, leaderUserId: input.leaderUserId, headUserId: input.headUserId, version: route.version, updatedPending: items.length }, input.reason.trim());
      return { version: route.version, updatedPending: items.length };
    });
    await this.deliver(pushes); return result;
  }
}
