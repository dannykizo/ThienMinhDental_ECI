import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { ConfigurationAuditLogEntity, LeaveRequestEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { canReviewLeave, hasValidLeaveReviewNote, isValidLeaveDateRange } from './domain/leave-status.js';
import type { CreateOwnLeaveRequestDto, ReviewLeaveRequestDto } from './leave.dto.js';

@Injectable()
export class LeaveService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  list(): Promise<unknown[]> {
    return this.listQuery();
  }

  async listMine(user: AuthenticatedUserView): Promise<unknown[]> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.listQuery(user.employeeId);
  }

  async create(user: AuthenticatedUserView, employeeId: string, input: CreateOwnLeaveRequestDto): Promise<LeaveRequestEntity> {
    return this.createForEmployee(user, employeeId, input);
  }

  async createMine(user: AuthenticatedUserView, input: CreateOwnLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.createForEmployee(user, user.employeeId, input);
  }

  async review(id: string, user: AuthenticatedUserView, input: ReviewLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (!hasValidLeaveReviewNote(input.status, input.reviewNote)) throw new BadRequestException({ code: 'LEAVE_REJECTION_REASON_REQUIRED', message: 'Lý do từ chối phải có ít nhất 5 ký tự.' });
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.getRepository(LeaveRequestEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request) throw new NotFoundException({ code: 'LEAVE_REQUEST_NOT_FOUND', message: 'Không tìm thấy đơn nghỉ.' });
      if (!canReviewLeave(request.status)) throw new ConflictException({ code: 'LEAVE_ALREADY_REVIEWED', message: 'Chỉ đơn đang chờ mới được duyệt hoặc từ chối.' });
      await this.assertOpenPeriod(manager, request.startDate, request.endDate);
      const oldValue = { status: request.status, reviewNote: request.reviewNote ?? null };
      request.status = input.status;
      request.reviewNote = input.reviewNote?.trim() || null;
      request.reviewedBy = user.id;
      request.reviewedAt = new Date();
      const saved = await manager.getRepository(LeaveRequestEntity).save(request);
      await this.audit(manager, user.id, id, input.status === 'APPROVED' ? 'APPROVE' : 'REJECT', oldValue, { status: saved.status, reviewNote: saved.reviewNote, reviewedAt: saved.reviewedAt });
      return saved;
    });
  }

  history(id: string): Promise<unknown[]> {
    return this.dataSource.query(`SELECT l.id,l.action,l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='LEAVE_REQUEST' AND l.resource_id=$1 ORDER BY l.created_at DESC`, [id]);
  }

  private async createForEmployee(user: AuthenticatedUserView, employeeId: string, input: CreateOwnLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (!isValidLeaveDateRange(input.startDate, input.endDate)) throw new BadRequestException({ code: 'INVALID_LEAVE_RANGE', message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' });
    return this.dataSource.transaction(async (manager) => {
      const [employee] = await manager.query<Array<{ id: string }>>('SELECT id FROM employees WHERE id=$1 AND is_active=true', [employeeId]);
      if (!employee) throw new BadRequestException({ code: 'LEAVE_EMPLOYEE_INVALID', message: 'Nhân viên không tồn tại hoặc đã bị khóa.' });
      await this.assertOpenPeriod(manager, input.startDate, input.endDate);
      const overlap = await manager.getRepository(LeaveRequestEntity).createQueryBuilder('leave')
        .where('leave.employee_id=:employeeId', { employeeId })
        .andWhere("leave.status IN ('SUBMITTED','APPROVED')")
        .andWhere('leave.start_date <= :endDate AND leave.end_date >= :startDate', { startDate: input.startDate, endDate: input.endDate })
        .getOne();
      if (overlap) throw new ConflictException({ code: 'LEAVE_DATE_OVERLAP', message: 'Khoảng nghỉ trùng với đơn đang chờ hoặc đã duyệt.' });
      const request = manager.getRepository(LeaveRequestEntity).create({ employeeId, leaveType: input.leaveType, startDate: input.startDate, endDate: input.endDate, reason: input.reason.trim(), status: 'SUBMITTED', submittedBy: user.id, submittedAt: new Date() });
      const saved = await manager.getRepository(LeaveRequestEntity).save(request);
      await this.audit(manager, user.id, saved.id, 'SUBMIT', null, { employeeId, leaveType: saved.leaveType, startDate: saved.startDate, endDate: saved.endDate, status: saved.status });
      return saved;
    });
  }

  private listQuery(employeeId?: string): Promise<unknown[]> {
    return this.dataSource.query(`SELECT l.id,l.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName",d.name AS "departmentName",l.leave_type AS "leaveType",l.start_date::text AS "startDate",l.end_date::text AS "endDate",l.reason,l.status,l.submitted_at AS "submittedAt",COALESCE(submitter.full_name,su.email) AS "submittedByName",l.review_note AS "reviewNote",l.reviewed_at AS "reviewedAt",COALESCE(reviewer.full_name,ru.email) AS "reviewedByName" FROM leave_requests l JOIN employees e ON e.id=l.employee_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN users su ON su.id=l.submitted_by LEFT JOIN employees submitter ON submitter.user_id=su.id LEFT JOIN users ru ON ru.id=l.reviewed_by LEFT JOIN employees reviewer ON reviewer.user_id=ru.id WHERE ($1::uuid IS NULL OR l.employee_id=$1) ORDER BY l.submitted_at DESC,l.created_at DESC`, [employeeId ?? null]);
  }

  private async assertOpenPeriod(manager: EntityManager, startDate: string, endDate: string): Promise<void> {
    const [locked] = await manager.query<Array<{ periodMonth: string }>>(`SELECT period_month::text AS "periodMonth" FROM attendance_periods WHERE status='LOCKED' AND period_month BETWEEN date_trunc('month',$1::date)::date AND date_trunc('month',$2::date)::date ORDER BY period_month LIMIT 1`, [startDate, endDate]);
    if (locked) throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: `Kỳ công ${locked.periodMonth.slice(0, 7)} đã chốt; không thể thay đổi đơn nghỉ.` });
  }

  private audit(manager: EntityManager, userId: string, resourceId: string, action: string, oldValue: unknown, newValue: unknown): Promise<ConfigurationAuditLogEntity> {
    return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, { resourceType: 'LEAVE_REQUEST', resourceId, action, oldValue, newValue, createdBy: userId }));
  }
}
