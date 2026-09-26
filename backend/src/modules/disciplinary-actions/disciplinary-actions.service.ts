import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { DisciplinaryActionEntity } from '../../database/entities/disciplinary-action.entity.js';
import {
  AnnouncementEntity,
  ConfigurationAuditLogEntity,
} from '../../database/entities/workforce.entity.js';
import { AnnouncementsService } from '../announcements/announcements.service.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type {
  CreateDisciplinaryActionDto,
  RevokeDisciplinaryActionDto,
  UpdateDisciplinaryActionDto,
} from './disciplinary-actions.dto.js';
import {
  canTransitionDisciplinaryAction,
  type DisciplinaryActionType,
  isValidDisciplinaryPeriod,
} from './domain/disciplinary-action-policy.js';

const actionTypeLabels: Record<DisciplinaryActionType, string> = {
  WARNING: 'Cảnh cáo',
  SUSPENSION: 'Đình chỉ',
  DISCIPLINARY_ACTION: 'Xử lý vi phạm',
};

@Injectable()
export class DisciplinaryActionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly announcements: AnnouncementsService,
  ) {}

  list(): Promise<unknown[]> {
    return this.dataSource.query(`SELECT da.id,da.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName",d.name AS "departmentName",da.action_type AS "actionType",da.status,da.title,da.reason,da.decision,da.effective_from AS "effectiveFrom",da.effective_to AS "effectiveTo",da.issued_at AS "issuedAt",da.revoked_at AS "revokedAt",da.revocation_reason AS "revocationReason",da.announcement_id AS "announcementId",da.created_at AS "createdAt",COALESCE(creator_employee.full_name,creator.email) AS "createdByName",COALESCE(issuer_employee.full_name,issuer.email) AS "issuedByName" FROM employee_disciplinary_actions da JOIN employees e ON e.id=da.employee_id LEFT JOIN employee_organization_assignments oa ON oa.employee_id=e.id AND oa.is_primary=true AND oa.effective_to IS NULL LEFT JOIN departments d ON d.id=oa.department_id JOIN users creator ON creator.id=da.created_by LEFT JOIN employees creator_employee ON creator_employee.user_id=creator.id LEFT JOIN users issuer ON issuer.id=da.issued_by LEFT JOIN employees issuer_employee ON issuer_employee.user_id=issuer.id ORDER BY da.created_at DESC`);
  }

  async create(
    user: AuthenticatedUserView,
    input: CreateDisciplinaryActionDto,
  ): Promise<DisciplinaryActionEntity> {
    this.assertPeriod(input.actionType, input.effectiveFrom, input.effectiveTo);
    return this.dataSource.transaction(async (manager) => {
      await this.assertEmployee(manager, input.employeeId, false);
      const repository = manager.getRepository(DisciplinaryActionEntity);
      const action = await repository.save(
        repository.create({
          actionType: input.actionType,
          createdBy: user.id,
          decision: input.decision.trim(),
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          employeeId: input.employeeId,
          reason: input.reason.trim(),
          status: 'DRAFT',
          title: input.title.trim(),
        }),
      );
      await this.audit(manager, user.id, action.id, 'CREATE', null, this.summary(action));
      return action;
    });
  }

  async update(
    user: AuthenticatedUserView,
    id: string,
    input: UpdateDisciplinaryActionDto,
  ): Promise<DisciplinaryActionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DisciplinaryActionEntity);
      const action = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!action) this.notFound();
      if (action.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'DISCIPLINARY_ACTION_NOT_DRAFT',
          message: 'Chỉ quyết định nháp mới được chỉnh sửa.',
        });
      }
      const actionType = input.actionType ?? action.actionType as DisciplinaryActionType;
      const effectiveFrom = input.effectiveFrom ?? action.effectiveFrom;
      const effectiveTo = input.effectiveTo ?? action.effectiveTo;
      this.assertPeriod(actionType, effectiveFrom, effectiveTo);
      const employeeId = input.employeeId ?? action.employeeId;
      await this.assertEmployee(manager, employeeId, false);
      const oldValue = this.summary(action);
      Object.assign(action, {
        actionType,
        decision: input.decision?.trim() ?? action.decision,
        effectiveFrom,
        effectiveTo: effectiveTo ?? null,
        employeeId,
        reason: input.reason?.trim() ?? action.reason,
        title: input.title?.trim() ?? action.title,
      });
      const saved = await repository.save(action);
      await this.audit(manager, user.id, id, 'UPDATE', oldValue, this.summary(saved));
      return saved;
    });
  }

  async issue(
    user: AuthenticatedUserView,
    id: string,
  ): Promise<DisciplinaryActionEntity> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DisciplinaryActionEntity);
      const action = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!action) this.notFound();
      if (!canTransitionDisciplinaryAction(action.status, 'ISSUED')) {
        throw new ConflictException({
          code: 'DISCIPLINARY_ACTION_CANNOT_BE_ISSUED',
          message: 'Quyết định này không còn ở trạng thái có thể ban hành.',
        });
      }
      this.assertPeriod(
        action.actionType as DisciplinaryActionType,
        action.effectiveFrom,
        action.effectiveTo,
      );
      await this.assertEmployee(manager, action.employeeId, true);
      const oldValue = this.summary(action);
      const announcement = await this.announcements.createPublishedIndividualWithinTransaction(
        manager,
        {
          body: this.issueBody(action),
          createdBy: user.id,
          employeeId: action.employeeId,
          title: `[${this.actionLabel(action.actionType)}] ${action.title}`.slice(0, 200),
        },
      );
      action.status = 'ISSUED';
      action.issuedAt = new Date();
      action.issuedBy = user.id;
      action.announcementId = announcement.id;
      const saved = await repository.save(action);
      await this.audit(manager, user.id, id, 'ISSUE', oldValue, this.summary(saved));
      return { action: saved, announcement };
    });
    await this.announcements.deliverPublishedAnnouncementPush(
      result.announcement,
      [result.action.employeeId],
    );
    return result.action;
  }

  async revoke(
    user: AuthenticatedUserView,
    id: string,
    input: RevokeDisciplinaryActionDto,
  ): Promise<DisciplinaryActionEntity> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DisciplinaryActionEntity);
      const action = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!action) this.notFound();
      if (!canTransitionDisciplinaryAction(action.status, 'REVOKED')) {
        throw new ConflictException({
          code: 'DISCIPLINARY_ACTION_CANNOT_BE_REVOKED',
          message: 'Chỉ quyết định đã ban hành mới có thể thu hồi.',
        });
      }
      const oldValue = this.summary(action);
      const reason = input.reason.trim();
      let announcement: AnnouncementEntity | null = null;
      const employeeCanReceive = await this.employeeCanReceive(manager, action.employeeId);
      if (employeeCanReceive) {
        announcement = await this.announcements.createPublishedIndividualWithinTransaction(
          manager,
          {
            body: `Quyết định “${action.title}” đã được thu hồi.\n\nLý do thu hồi: ${reason}\n\nVui lòng xác nhận bạn đã nhận thông tin này.`,
            createdBy: user.id,
            employeeId: action.employeeId,
            title: `[THU HỒI] ${action.title}`.slice(0, 200),
          },
        );
      }
      action.status = 'REVOKED';
      action.revokedAt = new Date();
      action.revokedBy = user.id;
      action.revocationReason = reason;
      action.revocationAnnouncementId = announcement?.id ?? null;
      const saved = await repository.save(action);
      await this.audit(manager, user.id, id, 'REVOKE', oldValue, this.summary(saved));
      return { action: saved, announcement };
    });
    if (result.announcement) {
      await this.announcements.deliverPublishedAnnouncementPush(
        result.announcement,
        [result.action.employeeId],
      );
    }
    return result.action;
  }

  async history(id: string): Promise<unknown[]> {
    const exists = await this.dataSource
      .getRepository(DisciplinaryActionEntity)
      .exists({ where: { id } });
    if (!exists) this.notFound();
    return this.dataSource.query(
      `SELECT l.id,l.action,l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='DISCIPLINARY_ACTION' AND l.resource_id=$1 ORDER BY l.created_at DESC`,
      [id],
    );
  }

  private assertPeriod(
    actionType: DisciplinaryActionType,
    effectiveFrom: string,
    effectiveTo?: string | null,
  ): void {
    if (!isValidDisciplinaryPeriod(actionType, effectiveFrom, effectiveTo)) {
      throw new BadRequestException({
        code: 'DISCIPLINARY_ACTION_PERIOD_INVALID',
        message:
          actionType === 'SUSPENSION'
            ? 'Đình chỉ phải có ngày bắt đầu, ngày kết thúc và ngày kết thúc không được trước ngày bắt đầu.'
            : 'Khoảng hiệu lực của quyết định không hợp lệ.',
      });
    }
  }

  private async assertEmployee(
    manager: EntityManager,
    employeeId: string,
    requireActiveAccount: boolean,
  ): Promise<void> {
    const [employee] = await manager.query<Array<{ accountActive: boolean | null; id: string; isActive: boolean; userId: string | null }>>(
      `SELECT e.id,e.is_active AS "isActive",e.user_id AS "userId",u.is_active AS "accountActive" FROM employees e LEFT JOIN users u ON u.id=e.user_id WHERE e.id=$1`,
      [employeeId],
    );
    if (!employee) {
      throw new BadRequestException({
        code: 'DISCIPLINARY_EMPLOYEE_NOT_FOUND',
        message: 'Không tìm thấy nhân viên.',
      });
    }
    if (requireActiveAccount && (!employee.isActive || !employee.userId || !employee.accountActive)) {
      throw new ConflictException({
        code: 'DISCIPLINARY_EMPLOYEE_CANNOT_RECEIVE',
        message: 'Nhân viên phải đang hoạt động và có tài khoản hoạt động để nhận quyết định.',
      });
    }
  }

  private async employeeCanReceive(
    manager: EntityManager,
    employeeId: string,
  ): Promise<boolean> {
    const [employee] = await manager.query<Array<{ canReceive: boolean }>>(
      `SELECT (e.is_active=true AND e.user_id IS NOT NULL AND u.is_active=true) AS "canReceive" FROM employees e LEFT JOIN users u ON u.id=e.user_id WHERE e.id=$1`,
      [employeeId],
    );
    return employee?.canReceive ?? false;
  }

  private issueBody(action: DisciplinaryActionEntity): string {
    const period = action.effectiveTo
      ? `${action.effectiveFrom} đến ${action.effectiveTo}`
      : `từ ${action.effectiveFrom}`;
    return `Loại quyết định: ${this.actionLabel(action.actionType)}\nHiệu lực: ${period}\n\nLý do: ${action.reason}\n\nNội dung xử lý: ${action.decision}\n\nVui lòng xác nhận bạn đã nhận và đọc quyết định này.`;
  }

  private actionLabel(actionType: string): string {
    return actionTypeLabels[actionType as DisciplinaryActionType] ?? actionType;
  }

  private summary(action: DisciplinaryActionEntity): Record<string, unknown> {
    return {
      actionType: action.actionType,
      announcementId: action.announcementId ?? null,
      decision: action.decision,
      effectiveFrom: action.effectiveFrom,
      effectiveTo: action.effectiveTo ?? null,
      employeeId: action.employeeId,
      issuedAt: action.issuedAt ?? null,
      reason: action.reason,
      revocationReason: action.revocationReason ?? null,
      revokedAt: action.revokedAt ?? null,
      status: action.status,
      title: action.title,
    };
  }

  private audit(
    manager: EntityManager,
    userId: string,
    resourceId: string,
    action: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<ConfigurationAuditLogEntity> {
    return manager.save(
      ConfigurationAuditLogEntity,
      manager.create(ConfigurationAuditLogEntity, {
        action,
        createdBy: userId,
        newValue,
        oldValue,
        resourceId,
        resourceType: 'DISCIPLINARY_ACTION',
      }),
    );
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'DISCIPLINARY_ACTION_NOT_FOUND',
      message: 'Không tìm thấy quyết định xử lý.',
    });
  }
}
