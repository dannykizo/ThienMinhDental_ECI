import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { PushDeviceTokenEntity } from '../../database/entities/push-device-token.entity.js';
import { AnnouncementEntity, AnnouncementRecipientEntity, ConfigurationAuditLogEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import {
  ANNOUNCEMENT_PUSH_SENDER,
  type AnnouncementPushSender,
} from './application/announcement-push.sender.js';
import { canAcknowledgeAnnouncement, canTransitionAnnouncement } from './domain/announcement-status.js';
import type {
  CreateAnnouncementDto,
  RegisterPushDeviceDto,
  TransitionAnnouncementDto,
  UnregisterPushDeviceDto,
  UpdateAnnouncementDto,
} from './announcements.dto.js';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ANNOUNCEMENT_PUSH_SENDER)
    private readonly pushSender: AnnouncementPushSender,
  ) {}

  list(): Promise<unknown[]> {
    return this.dataSource.query(`SELECT a.id,a.title,a.body,a.status,a.audience_type AS "audienceType",a.department_id AS "departmentId",a.employee_id AS "employeeId",a.requires_acknowledgement AS "requiresAcknowledgement",COALESCE(d.name,target.full_name,CASE WHEN a.audience_type='ALL' THEN 'Toàn bộ nhân viên (dữ liệu cũ)' END) AS "targetName",a.created_at AS "createdAt",a.published_at AS "publishedAt",a.withdrawn_at AS "withdrawnAt",a.withdraw_reason AS "withdrawReason",COALESCE(creator.full_name,cu.email) AS "createdByName",COUNT(ar.employee_id)::int AS "recipientCount",COUNT(ar.read_at)::int AS "readCount",COUNT(ar.acknowledged_at)::int AS "acknowledgedCount" FROM announcements a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN employees target ON target.id=a.employee_id JOIN users cu ON cu.id=a.created_by LEFT JOIN employees creator ON creator.user_id=cu.id LEFT JOIN announcement_recipients ar ON ar.announcement_id=a.id GROUP BY a.id,d.name,target.full_name,creator.full_name,cu.email ORDER BY a.created_at DESC`);
  }

  async managed(user: AuthenticatedUserView): Promise<unknown[]> {
    if (user.roles.includes(RoleCode.Admin)) return this.list();
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.dataSource.query(`SELECT a.id,a.title,a.body,a.status,a.audience_type AS "audienceType",a.requires_acknowledgement AS "requiresAcknowledgement",a.published_at AS "publishedAt",COUNT(DISTINCT ar.employee_id)::int AS "recipientCount",COUNT(DISTINCT ar.employee_id) FILTER (WHERE ar.read_at IS NOT NULL)::int AS "readCount",COUNT(DISTINCT ar.employee_id) FILTER (WHERE ar.acknowledged_at IS NOT NULL)::int AS "acknowledgedCount" FROM announcements a JOIN announcement_recipients ar ON ar.announcement_id=a.id JOIN employee_organization_assignments oa ON oa.employee_id=ar.employee_id AND oa.effective_to IS NULL AND oa.manager_employee_id=$1 WHERE a.status IN ('PUBLISHED','WITHDRAWN') GROUP BY a.id ORDER BY a.published_at DESC`, [user.employeeId]);
  }

  mine(user: AuthenticatedUserView): Promise<unknown[]> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.dataSource.query(`SELECT a.id,a.title,a.body,a.requires_acknowledgement AS "requiresAcknowledgement",a.published_at AS "publishedAt",ar.delivered_at AS "deliveredAt",ar.read_at AS "readAt",ar.acknowledged_at AS "acknowledgedAt" FROM announcement_recipients ar JOIN announcements a ON a.id=ar.announcement_id WHERE ar.employee_id=$1 AND a.status='PUBLISHED' ORDER BY a.published_at DESC`, [user.employeeId]);
  }

  async registerPushDevice(
    user: AuthenticatedUserView,
    input: RegisterPushDeviceDto,
  ): Promise<{ pushConfigured: boolean; registered: true }> {
    if (!user.employeeId) {
      throw new BadRequestException({
        code: 'EMPLOYEE_PROFILE_REQUIRED',
        message: 'Tài khoản chưa liên kết nhân viên.',
      });
    }
    const employeeId = user.employeeId;
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PushDeviceTokenEntity);
      const sameToken = await repository.findOne({
        where: { token: input.token },
      });
      if (
        sameToken &&
        (sameToken.userId !== user.id || sameToken.deviceId !== input.deviceId)
      ) {
        await repository.remove(sameToken);
      }

      let device = await repository.findOne({
        where: { deviceId: input.deviceId, userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      device ??= repository.create({
        deviceId: input.deviceId,
        employeeId,
        userId: user.id,
      });
      Object.assign(device, {
        employeeId,
        isActive: true,
        lastError: null,
        lastRegisteredAt: new Date(),
        platform: input.platform,
        token: input.token,
      });
      await repository.save(device);
    });
    return {
      pushConfigured: this.pushSender.isConfigured(),
      registered: true,
    };
  }

  async unregisterPushDevice(
    user: AuthenticatedUserView,
    input: UnregisterPushDeviceDto,
  ): Promise<{ unregistered: true }> {
    await this.dataSource
      .getRepository(PushDeviceTokenEntity)
      .update(
        { deviceId: input.deviceId, userId: user.id },
        { isActive: false, lastError: null },
      );
    return { unregistered: true };
  }

  async markRead(user: AuthenticatedUserView, announcementId: string): Promise<AnnouncementRecipientEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const employeeId = user.employeeId;
    return this.dataSource.transaction(async (manager) => {
      const announcement = await manager.getRepository(AnnouncementEntity).findOne({ where: { id: announcementId } });
      if (!announcement || announcement.status !== 'PUBLISHED') throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_AVAILABLE', message: 'Thông báo không còn khả dụng.' });
      const repository = manager.getRepository(AnnouncementRecipientEntity);
      const recipient = await repository.findOne({ where: { announcementId, employeeId }, lock: { mode: 'pessimistic_write' } });
      if (!recipient) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_RECEIVED', message: 'Không tìm thấy thông báo trong danh sách nhận.' });
      if (!recipient.readAt) recipient.readAt = new Date();
      return repository.save(recipient);
    });
  }

  async acknowledge(user: AuthenticatedUserView, announcementId: string): Promise<AnnouncementRecipientEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const employeeId = user.employeeId;
    return this.dataSource.transaction(async (manager) => {
      const announcement = await manager.getRepository(AnnouncementEntity).findOne({ where: { id: announcementId } });
      if (!announcement) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND', message: 'Không tìm thấy thông báo.' });
      if (!canAcknowledgeAnnouncement(announcement.status, announcement.requiresAcknowledgement)) throw new ConflictException({ code: 'ANNOUNCEMENT_ACKNOWLEDGEMENT_NOT_REQUIRED', message: 'Thông báo này không yêu cầu xác nhận hoặc đã được thu hồi.' });
      const repository = manager.getRepository(AnnouncementRecipientEntity);
      const recipient = await repository.findOne({ where: { announcementId, employeeId }, lock: { mode: 'pessimistic_write' } });
      if (!recipient) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_RECEIVED', message: 'Không tìm thấy thông báo trong danh sách nhận.' });
      const now = new Date();
      recipient.readAt ??= now;
      recipient.acknowledgedAt ??= now;
      return repository.save(recipient);
    });
  }

  async create(user: AuthenticatedUserView, input: CreateAnnouncementDto): Promise<AnnouncementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const target = this.target(input.audienceType, input.departmentId, input.employeeId);
      await this.assertTarget(manager, input.audienceType, target.departmentId, target.employeeId);
      const repository = manager.getRepository(AnnouncementEntity);
      const saved = await repository.save(repository.create({ title: input.title.trim(), body: input.body.trim(), audienceType: input.audienceType, ...target, requiresAcknowledgement: input.requiresAcknowledgement, status: 'DRAFT', createdBy: user.id }));
      await this.audit(manager, user.id, saved.id, 'CREATE', null, this.summary(saved));
      return saved;
    });
  }

  async update(user: AuthenticatedUserView, id: string, input: UpdateAnnouncementDto): Promise<AnnouncementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AnnouncementEntity);
      const announcement = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!announcement) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND', message: 'Không tìm thấy thông báo.' });
      if (announcement.status !== 'DRAFT') throw new ConflictException({ code: 'ANNOUNCEMENT_NOT_DRAFT', message: 'Chỉ thông báo nháp mới được chỉnh sửa.' });
      const oldValue = { ...this.summary(announcement), bodyChanged: false };
      const audienceType = input.audienceType ?? announcement.audienceType as 'DEPARTMENT' | 'EMPLOYEE';
      const target = this.target(audienceType, input.departmentId ?? announcement.departmentId ?? undefined, input.employeeId ?? announcement.employeeId ?? undefined);
      await this.assertTarget(manager, audienceType, target.departmentId, target.employeeId);
      const bodyChanged = input.body !== undefined && input.body.trim() !== announcement.body;
      Object.assign(announcement, { title: input.title?.trim() ?? announcement.title, body: input.body?.trim() ?? announcement.body, audienceType, ...target, requiresAcknowledgement: input.requiresAcknowledgement ?? announcement.requiresAcknowledgement });
      const saved = await repository.save(announcement);
      await this.audit(manager, user.id, id, 'UPDATE', oldValue, { ...this.summary(saved), bodyChanged });
      return saved;
    });
  }

  async transition(user: AuthenticatedUserView, id: string, input: TransitionAnnouncementDto): Promise<AnnouncementEntity> {
    const recipientIds: string[] = [];
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AnnouncementEntity);
      const announcement = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!announcement) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND', message: 'Không tìm thấy thông báo.' });
      if (!canTransitionAnnouncement(announcement.status, input.status)) throw new ConflictException({ code: 'INVALID_ANNOUNCEMENT_TRANSITION', message: `Không thể chuyển thông báo từ ${announcement.status} sang ${input.status}.` });
      const oldValue = this.summary(announcement);
      if (input.status === 'PUBLISHED') {
        const recipientRows = await this.resolveRecipients(manager, announcement);
        if (recipientRows.length === 0) throw new ConflictException({ code: 'ANNOUNCEMENT_HAS_NO_RECIPIENTS', message: 'Không có nhân viên đang hoạt động phù hợp với đối tượng nhận.' });
        const recipientRepository = manager.getRepository(AnnouncementRecipientEntity);
        await recipientRepository.save(recipientRows.map(({ id: employeeId }) => recipientRepository.create({ announcementId: id, employeeId, deliveredAt: new Date() })));
        recipientIds.push(...recipientRows.map((recipient) => recipient.id));
        announcement.publishedAt = new Date();
      }
      if (input.status === 'WITHDRAWN') {
        announcement.withdrawnBy = user.id;
        announcement.withdrawnAt = new Date();
        announcement.withdrawReason = input.reason?.trim() || null;
      }
      announcement.status = input.status;
      const saved = await repository.save(announcement);
      await this.audit(manager, user.id, id, input.status, oldValue, this.summary(saved));
      return saved;
    });
    if (input.status === 'PUBLISHED') {
      await this.pushSender.sendAnnouncement({
        announcementId: saved.id,
        body: saved.body,
        employeeIds: recipientIds,
        requiresAcknowledgement: saved.requiresAcknowledgement,
        title: saved.title,
      });
    }
    return saved;
  }

  async recipients(user: AuthenticatedUserView, id: string): Promise<unknown[]> {
    const [announcement] = await this.dataSource.query<Array<{ id: string }>>('SELECT id FROM announcements WHERE id=$1', [id]);
    if (!announcement) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND', message: 'Không tìm thấy thông báo.' });
    if (user.roles.includes(RoleCode.Admin)) {
      return this.dataSource.query(`SELECT e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName",d.name AS "departmentName",ar.delivered_at AS "deliveredAt",ar.read_at AS "readAt",ar.acknowledged_at AS "acknowledgedAt" FROM announcement_recipients ar JOIN employees e ON e.id=ar.employee_id LEFT JOIN employee_organization_assignments oa ON oa.employee_id=e.id AND oa.is_primary=true AND oa.effective_to IS NULL LEFT JOIN departments d ON d.id=oa.department_id WHERE ar.announcement_id=$1 ORDER BY e.full_name`, [id]);
    }
    if (!user.employeeId) throw new ForbiddenException({ code: 'ANNOUNCEMENT_TRACKING_FORBIDDEN', message: 'Bạn không có phạm vi nhân viên để theo dõi.' });
    return this.dataSource.query(`SELECT DISTINCT e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName",d.name AS "departmentName",ar.delivered_at AS "deliveredAt",ar.read_at AS "readAt",ar.acknowledged_at AS "acknowledgedAt" FROM announcement_recipients ar JOIN employees e ON e.id=ar.employee_id JOIN employee_organization_assignments oa ON oa.employee_id=e.id AND oa.effective_to IS NULL AND oa.manager_employee_id=$2 JOIN departments d ON d.id=oa.department_id WHERE ar.announcement_id=$1 ORDER BY e.full_name`, [id, user.employeeId]);
  }

  history(id: string): Promise<unknown[]> {
    return this.dataSource.query(`SELECT l.id,l.action,l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='ANNOUNCEMENT' AND l.resource_id=$1 ORDER BY l.created_at DESC`, [id]);
  }

  private target(audienceType: 'DEPARTMENT' | 'EMPLOYEE', departmentId?: string, employeeId?: string): { departmentId: string | null; employeeId: string | null } {
    if (audienceType === 'DEPARTMENT') {
      if (!departmentId) throw new BadRequestException({ code: 'DEPARTMENT_REQUIRED', message: 'Phải chọn phòng ban nhận thông báo.' });
      return { departmentId, employeeId: null };
    }
    if (!employeeId) throw new BadRequestException({ code: 'EMPLOYEE_REQUIRED', message: 'Phải chọn nhân viên nhận thông báo.' });
    return { departmentId: null, employeeId };
  }

  private async assertTarget(manager: EntityManager, audienceType: 'DEPARTMENT' | 'EMPLOYEE', departmentId: string | null, employeeId: string | null): Promise<void> {
    if (audienceType === 'DEPARTMENT') {
      const [department] = await manager.query<Array<{ id: string }>>('SELECT id FROM departments WHERE id=$1 AND is_active=true', [departmentId]);
      if (!department) throw new BadRequestException({ code: 'ANNOUNCEMENT_DEPARTMENT_INVALID', message: 'Phòng ban không tồn tại hoặc đã bị khóa.' });
      return;
    }
    const [employee] = await manager.query<Array<{ id: string }>>('SELECT id FROM employees WHERE id=$1 AND is_active=true', [employeeId]);
    if (!employee) throw new BadRequestException({ code: 'ANNOUNCEMENT_EMPLOYEE_INVALID', message: 'Nhân viên không tồn tại hoặc đã bị khóa.' });
  }

  private resolveRecipients(manager: EntityManager, announcement: AnnouncementEntity): Promise<Array<{ id: string }>> {
    if (announcement.audienceType === 'DEPARTMENT') {
      return manager.query(`SELECT DISTINCT e.id FROM employees e JOIN employee_organization_assignments oa ON oa.employee_id=e.id AND oa.effective_to IS NULL WHERE e.is_active=true AND oa.department_id=$1`, [announcement.departmentId]);
    }
    if (announcement.audienceType === 'EMPLOYEE') {
      return manager.query('SELECT id FROM employees WHERE id=$1 AND is_active=true', [announcement.employeeId]);
    }
    return manager.query('SELECT id FROM employees WHERE is_active=true');
  }

  private summary(announcement: AnnouncementEntity): Record<string, unknown> {
    return { title: announcement.title, status: announcement.status, audienceType: announcement.audienceType, departmentId: announcement.departmentId ?? null, employeeId: announcement.employeeId ?? null, requiresAcknowledgement: announcement.requiresAcknowledgement, publishedAt: announcement.publishedAt ?? null, withdrawnAt: announcement.withdrawnAt ?? null, withdrawReason: announcement.withdrawReason ?? null };
  }

  private audit(manager: EntityManager, userId: string, resourceId: string, action: string, oldValue: unknown, newValue: unknown): Promise<ConfigurationAuditLogEntity> {
    return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, { resourceType: 'ANNOUNCEMENT', resourceId, action, oldValue, newValue, createdBy: userId }));
  }
}
