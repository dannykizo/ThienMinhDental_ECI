import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { DisciplinaryActionEntity } from '../../database/entities/disciplinary-action.entity.js';
import { ConfigurationAuditLogEntity } from '../../database/entities/workforce.entity.js';
import { AnnouncementsService } from '../announcements/announcements.service.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import type { DisciplinaryGroupTargetDto, IssueDisciplinaryGroupDto, RevokeDisciplinaryActionDto } from './disciplinary-actions.dto.js';
import { DisciplinaryActionsService } from './disciplinary-actions.service.js';

interface Member { employeeId: string; employeeCode: string; employeeName: string; }
interface Group { id: string; status: string; selectedMembers: Member[]; }

@Injectable()
export class DisciplinaryGroupsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly actions: DisciplinaryActionsService, private readonly announcements: AnnouncementsService) {}

  async targets(user: AuthenticatedUserView): Promise<unknown[]> {
    this.assertAdmin(user);
    return this.dataSource.query(`SELECT id,'DEPARTMENT' AS "targetType",name FROM departments WHERE is_active=true UNION ALL SELECT t.id,'TEAM' AS "targetType",d.name || ' / ' || t.name AS name FROM organization_teams t JOIN departments d ON d.id=t.department_id WHERE t.is_active=true AND d.is_active=true ORDER BY name`);
  }

  async preview(user: AuthenticatedUserView, input: DisciplinaryGroupTargetDto): Promise<{ members: Member[]; rosterToken: string; targetName: string }> {
    this.assertAdmin(user);
    return this.dataSource.transaction((manager) => this.roster(manager, input));
  }

  async issue(user: AuthenticatedUserView, input: IssueDisciplinaryGroupDto): Promise<unknown> {
    this.assertAdmin(user);
    this.actions.assertContent(input);
    this.actions.assertPeriod(input.actionType, input.effectiveFrom, input.effectiveTo);
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL lock_timeout='5s'");
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.requestId]);
      const [existing] = await manager.query<Array<{ id: string }>>('SELECT id FROM disciplinary_action_groups WHERE request_id=$1', [input.requestId]);
      if (existing) throw new ConflictException({ code: 'DISCIPLINARY_GROUP_REQUEST_ALREADY_APPLIED', message: 'Lượt ban hành này đã được ghi nhận. Tải lại hồ sơ, không gửi lại.' });
      // Freeze membership changes while confirming the roster; no GPS or device data is involved.
      await manager.query('LOCK TABLE organization_team_memberships,employee_organization_assignments IN SHARE MODE');
      const first = await this.roster(manager, input);
      const allIds = first.members.map((member) => member.employeeId).sort();
      await manager.query('SELECT id FROM employees WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [allIds]);
      await manager.query('SELECT id FROM users WHERE id IN (SELECT user_id FROM employees WHERE id=ANY($1::uuid[])) ORDER BY id FOR SHARE', [allIds]);
      const preview = await this.roster(manager, input);
      if (preview.rosterToken !== input.rosterToken) throw new ConflictException({ code: 'DISCIPLINARY_ROSTER_CHANGED', message: 'Danh sách nhân sự đã thay đổi. Tải lại danh sách và chọn lại trước khi ban hành.' });
      const selected = new Set(input.employeeIds);
      const members = preview.members.filter((member) => selected.has(member.employeeId));
      if (!members.length || members.length !== selected.size) throw new BadRequestException({ code: 'DISCIPLINARY_SELECTION_INVALID', message: 'Chỉ chọn nhân sự trong danh sách hiện tại; cần ít nhất một người.' });
      const [group] = await manager.query<Array<{ id: string }>>(`INSERT INTO disciplinary_action_groups(target_type,team_id,department_id,target_name,selected_members,title,action_type,reason,decision,effective_from,effective_to,issued_by,request_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [input.targetType, input.targetType === 'TEAM' ? input.targetId : null, input.targetType === 'DEPARTMENT' ? input.targetId : null, preview.targetName, JSON.stringify(members), input.title.trim(), input.actionType, input.reason.trim(), input.decision.trim(), input.effectiveFrom, input.effectiveTo ?? null, user.id, input.requestId]);
      const deliveries = [];
      for (const member of members) {
        const repository = manager.getRepository(DisciplinaryActionEntity);
        const action = await repository.save(repository.create({ groupId: group.id, employeeId: member.employeeId, actionType: input.actionType, title: input.title.trim(), reason: input.reason.trim(), decision: input.decision.trim(), effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, status: 'DRAFT', createdBy: user.id }));
        deliveries.push(await this.actions.issueWithinTransaction(manager, user, action.id, group.id));
      }
      await this.audit(manager, user.id, group.id, 'ISSUE', { status: 'ISSUED', targetType: input.targetType, targetId: input.targetId, targetName: preview.targetName, selectedMembers: members, title: input.title.trim(), actionType: input.actionType, reason: input.reason.trim(), decision: input.decision.trim(), effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null });
      return { id: group.id, deliveries };
    }).catch((error: unknown) => this.concurrentError(error));
    for (const delivery of result.deliveries) await this.announcements.deliverPublishedAnnouncementPush(delivery.announcement, [delivery.action.employeeId]);
    return { id: result.id, status: 'ISSUED', recipientCount: result.deliveries.length };
  }

  async revoke(user: AuthenticatedUserView, id: string, input: RevokeDisciplinaryActionDto): Promise<unknown> {
    this.assertAdmin(user);
    if (input.reason.trim().length < 5) throw new BadRequestException('Lý do thu hồi cần ít nhất 5 ký tự.');
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL lock_timeout='5s'");
      const [group] = await manager.query<Group[]>(`SELECT id,status,selected_members AS "selectedMembers" FROM disciplinary_action_groups WHERE id=$1 FOR UPDATE`, [id]);
      if (!group) throw new NotFoundException('Không tìm thấy quyết định tập thể.');
      if (group.status !== 'ISSUED') throw new ConflictException({ code: 'DISCIPLINARY_GROUP_ALREADY_REVOKED', message: 'Quyết định tập thể đã được thu hồi.' });
      const children = await manager.getRepository(DisciplinaryActionEntity).find({ where: { groupId: id }, order: { employeeId: 'ASC' }, lock: { mode: 'pessimistic_write' } });
      const deliveries = [];
      // Only original child records; later additions to the team never receive this decision.
      for (const child of children) deliveries.push(await this.actions.revokeWithinTransaction(manager, user, child.id, input, id));
      await manager.query(`UPDATE disciplinary_action_groups SET status='REVOKED',revoked_by=$2,revoked_at=clock_timestamp(),revocation_reason=$3 WHERE id=$1`, [id, user.id, input.reason.trim()]);
      await this.audit(manager, user.id, id, 'REVOKE', { status: 'REVOKED', previousStatus: 'ISSUED', selectedMembers: group.selectedMembers, reason: input.reason.trim(), retainedPersonalRecords: children.length });
      return { deliveries, originalRecipientCount: group.selectedMembers.length };
    }).catch((error: unknown) => this.concurrentError(error));
    for (const delivery of result.deliveries) if (delivery.announcement) await this.announcements.deliverPublishedAnnouncementPush(delivery.announcement, [delivery.action.employeeId]);
    return { id, status: 'REVOKED', originalRecipientCount: result.originalRecipientCount };
  }

  async list(user: AuthenticatedUserView): Promise<unknown[]> {
    this.assertAdmin(user);
    return this.dataSource.query(`SELECT g.id,g.target_type AS "targetType",g.target_name AS "targetName",g.selected_members AS "selectedMembers",g.title,g.action_type AS "actionType",g.reason,g.decision,g.effective_from::text AS "effectiveFrom",g.effective_to::text AS "effectiveTo",g.status,g.issued_at AS "issuedAt",g.revoked_at AS "revokedAt",g.revocation_reason AS "revocationReason",COALESCE((SELECT jsonb_agg(jsonb_build_object('employeeId',da.employee_id,'readAt',ar.read_at,'acknowledgedAt',ar.acknowledged_at)) FROM employee_disciplinary_actions da LEFT JOIN announcement_recipients ar ON ar.announcement_id=da.announcement_id AND ar.employee_id=da.employee_id WHERE da.group_id=g.id),'[]'::jsonb) AS receipts FROM disciplinary_action_groups g ORDER BY g.issued_at DESC`);
  }

  async history(user: AuthenticatedUserView, id: string): Promise<unknown[]> {
    this.assertAdmin(user);
    const [group] = await this.dataSource.query<Group[]>('SELECT id FROM disciplinary_action_groups WHERE id=$1', [id]);
    if (!group) throw new NotFoundException('Không tìm thấy quyết định tập thể.');
    return this.dataSource.query(`SELECT l.id,l.action,l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='DISCIPLINARY_GROUP' AND l.resource_id=$1 ORDER BY l.created_at,l.id`, [id]);
  }

  private async roster(manager: EntityManager, input: DisciplinaryGroupTargetDto): Promise<{ members: Member[]; rosterToken: string; targetName: string }> {
    const [target] = await manager.query<Array<{ name: string; departmentId: string }>>(input.targetType === 'TEAM' ? `SELECT t.name,d.id AS "departmentId" FROM organization_teams t JOIN departments d ON d.id=t.department_id WHERE t.id=$1 AND t.is_active=true AND d.is_active=true FOR SHARE OF t,d` : `SELECT name,id AS "departmentId" FROM departments WHERE id=$1 AND is_active=true FOR SHARE`, [input.targetId]);
    if (!target) throw new BadRequestException('Team/phòng ban không tồn tại hoặc đã ngừng hoạt động.');
    const members = await manager.query<Member[]>(`SELECT e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName" FROM employees e JOIN users u ON u.id=e.user_id WHERE e.is_active=true AND u.is_active=true AND EXISTS(SELECT 1 FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id WHERE a.employee_id=e.id AND a.department_id=$1 AND b.is_active=true AND a.effective_from<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (a.effective_to IS NULL OR a.effective_to>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) ${input.targetType === 'TEAM' ? 'AND EXISTS(SELECT 1 FROM organization_team_memberships m WHERE m.employee_id=e.id AND m.team_id=$2 AND m.ended_at IS NULL)' : ''} ORDER BY e.id`, input.targetType === 'TEAM' ? [target.departmentId, input.targetId] : [target.departmentId]);
    const rosterToken = createHash('sha256').update(JSON.stringify({ targetType: input.targetType, targetId: input.targetId, targetName: target.name, members })).digest('hex');
    return { members, rosterToken, targetName: target.name };
  }

  private audit(manager: EntityManager, createdBy: string, resourceId: string, action: string, newValue: unknown): Promise<ConfigurationAuditLogEntity> {
    return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, { createdBy, resourceId, resourceType: 'DISCIPLINARY_GROUP', action, oldValue: null, newValue, createdAt: new Date() }));
  }

  private assertAdmin(user: AuthenticatedUserView): void {
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException('Chỉ Admin được quản trị quyết định kỷ luật.');
  }

  private concurrentError(error: unknown): never {
    const code = (error as { driverError?: { code?: string } }).driverError?.code;
    if (['40P01', '40001', '55P03'].includes(code ?? '')) throw new ConflictException({ code: 'DISCIPLINARY_GROUP_CONCURRENT_CHANGE', message: 'Cơ cấu/hồ sơ đang được cập nhật. Tải lại dữ liệu trước khi thao tác tiếp.' });
    throw error;
  }
}
