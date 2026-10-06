import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { EmployeeLeaveBalanceEntity, LeaveBalanceAdjustmentEntity, LeavePolicyEntity } from '../../database/entities/leave-policy.entity.js';
import { ConfigurationAuditLogEntity, LeaveRequestEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import type { AdjustLeaveBalanceDto, CancelLeaveRequestDto, CreateLeavePolicyDto, CreateOwnLeaveRequestDto, InitializeLeaveBalancesDto, ReviewLeaveRequestDto, UpdateLeavePolicyDto } from './leave.dto.js';
import { availableLeaveMinutes, canCancelLeave, isValidLeaveDurationInput, type LeaveDurationType, minutesBetween, satisfiesMinimumNotice } from './domain/leave-policy.js';
import { hasValidLeaveReviewNote, isValidLeaveDateRange } from './domain/leave-status.js';
import { LeaveWorkflowService } from './application/leave-workflow.service.js';
import { AnnouncementEntity } from '../../database/entities/workforce.entity.js';

interface LeaveDurationResult {
  durationType: LeaveDurationType;
  endTime: string | null;
  halfDayPeriod: string | null;
  requestedMinutes: number;
  startTime: string | null;
}

@Injectable()
export class LeaveService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly workflow: LeaveWorkflowService) {}

  list(user: AuthenticatedUserView): Promise<unknown[]> { return this.workflow.list(user); }

  async listMine(user: AuthenticatedUserView): Promise<unknown[]> {
    if (!user.employeeId) this.employeeProfileRequired();
    return this.workflow.list(user, true);
  }

  listPolicies(): Promise<LeavePolicyEntity[]> {
    return this.dataSource.getRepository(LeavePolicyEntity).find({ order: { name: 'ASC' } });
  }

  async createPolicy(user: AuthenticatedUserView, input: CreateLeavePolicyDto): Promise<LeavePolicyEntity> {
    this.validatePolicy(input);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicyEntity);
      const code = input.code.trim().toUpperCase();
      const duplicate = await repository.findOne({ where: { code } });
      if (duplicate) throw new ConflictException({ code: 'LEAVE_POLICY_CODE_EXISTS', message: 'Mã chính sách nghỉ đã tồn tại.' });
      const policy = await repository.save(repository.create({ ...input, code, name: input.name.trim(), createdBy: user.id, isActive: true }));
      await this.audit(manager, user.id, 'LEAVE_POLICY', policy.id, 'CREATE', null, this.policySummary(policy));
      return policy;
    });
  }

  async updatePolicy(user: AuthenticatedUserView, id: string, input: UpdateLeavePolicyDto): Promise<LeavePolicyEntity> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicyEntity);
      const policy = await repository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!policy) this.policyNotFound();
      const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as UpdateLeavePolicyDto;
      const next = { ...policy, ...changes, name: input.name?.trim() ?? policy.name };
      this.validatePolicy(next);
      const oldValue = this.policySummary(policy);
      Object.assign(policy, changes);
      if (input.name !== undefined) policy.name = input.name.trim();
      const saved = await repository.save(policy);
      await this.audit(manager, user.id, 'LEAVE_POLICY', id, 'UPDATE', oldValue, this.policySummary(saved));
      return saved;
    });
  }

  parseYear(value?: string): number {
    const currentYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 4));
    if (!value) return currentYear;
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new BadRequestException({ code: 'LEAVE_BALANCE_YEAR_INVALID', message: 'Năm số dư phép không hợp lệ.' });
    return year;
  }

  listBalances(year: number): Promise<unknown[]> { return this.balanceQuery(year); }

  async listMyBalances(user: AuthenticatedUserView, year: number): Promise<unknown[]> {
    if (!user.employeeId) this.employeeProfileRequired();
    return this.balanceQuery(year, user.employeeId);
  }

  async initializeBalances(user: AuthenticatedUserView, input: InitializeLeaveBalancesDto): Promise<{ created: number }> {
    return this.dataSource.transaction(async (manager) => {
      const policies = await manager.getRepository(LeavePolicyEntity).createQueryBuilder('policy')
        .where('policy.is_active=true AND policy.balance_tracking_enabled=true')
        .andWhere(input.policyId ? 'policy.id=:policyId' : 'TRUE', { policyId: input.policyId })
        .getMany();
      if (input.policyId && policies.length === 0) this.policyNotFound();
      const employees = await manager.query<Array<{ id: string }>>('SELECT id FROM employees WHERE is_active=true ORDER BY id');
      let created = 0;
      for (const policy of policies) {
        for (const employee of employees) {
          const result = await this.ensureBalance(manager, employee.id, policy, input.year);
          if (result.created) {
            created += 1;
            await this.audit(manager, user.id, 'LEAVE_BALANCE', result.balance.id, 'INITIALIZE', null, this.balanceSummary(result.balance));
          }
        }
      }
      return { created };
    });
  }

  async adjustBalance(user: AuthenticatedUserView, input: AdjustLeaveBalanceDto): Promise<{ adjusted: true }> {
    if (input.deltaMinutes === 0) throw new BadRequestException({ code: 'LEAVE_BALANCE_ADJUSTMENT_ZERO', message: 'Số phút điều chỉnh phải khác 0.' });
    return this.dataSource.transaction(async (manager) => {
      const [employee] = await manager.query<Array<{ id: string }>>('SELECT id FROM employees WHERE id=$1 AND is_active=true', [input.employeeId]);
      if (!employee) throw new BadRequestException({ code: 'LEAVE_EMPLOYEE_INVALID', message: 'Nhân viên không tồn tại hoặc đã bị khóa.' });
      const policy = await manager.getRepository(LeavePolicyEntity).findOne({ where: { id: input.policyId, isActive: true } });
      if (!policy || !policy.balanceTrackingEnabled) throw new BadRequestException({ code: 'LEAVE_POLICY_BALANCE_DISABLED', message: 'Chính sách không tồn tại hoặc chưa bật theo dõi số dư.' });
      const { balance } = await this.ensureBalance(manager, input.employeeId, policy, input.year);
      const usage = await this.balanceUsage(manager, balance);
      const before = availableLeaveMinutes({ entitlement: balance.entitlementMinutes, carryOver: balance.carryOverMinutes, adjustments: usage.adjustments, approved: usage.approved, pending: usage.pending });
      if (before + input.deltaMinutes < 0) throw new ConflictException({ code: 'LEAVE_BALANCE_ADJUSTMENT_EXCEEDS_AVAILABLE', message: 'Điều chỉnh sẽ làm số dư khả dụng âm.' });
      await manager.getRepository(LeaveBalanceAdjustmentEntity).save(manager.getRepository(LeaveBalanceAdjustmentEntity).create({ balanceId: balance.id, createdBy: user.id, deltaMinutes: input.deltaMinutes, reason: input.reason.trim() }));
      await this.audit(manager, user.id, 'LEAVE_BALANCE', balance.id, 'ADJUST', { availableMinutes: before }, { availableMinutes: before + input.deltaMinutes, deltaMinutes: input.deltaMinutes, reason: input.reason.trim() });
      return { adjusted: true };
    });
  }

  async create(user: AuthenticatedUserView, employeeId: string, input: CreateOwnLeaveRequestDto): Promise<LeaveRequestEntity> { return this.createForEmployee(user, employeeId, input); }

  async createMine(user: AuthenticatedUserView, input: CreateOwnLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (!user.employeeId) this.employeeProfileRequired();
    return this.createForEmployee(user, user.employeeId, input);
  }

  async review(id: string, user: AuthenticatedUserView, input: ReviewLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (!hasValidLeaveReviewNote(input.status, input.reviewNote)) throw new BadRequestException({ code: 'LEAVE_REJECTION_REASON_REQUIRED', message: 'Lý do từ chối phải có ít nhất 5 ký tự.' });
    return this.workflow.process(user, id, input, false, (manager, request) => this.assertBalanceAvailableForRequest(manager, request));
  }

  async cancel(id: string, user: AuthenticatedUserView, input: CancelLeaveRequestDto): Promise<LeaveRequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      const initial = await manager.getRepository(LeaveRequestEntity).findOneBy({ id });
      if (!initial) this.requestNotFound();
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`leave-route:${initial.employeeId}`]);
      const request = await manager.getRepository(LeaveRequestEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request) this.requestNotFound();
      const canManage = user.roles.includes(RoleCode.Admin);
      if (!canManage && request.employeeId !== user.employeeId) throw new ForbiddenException({ code: 'LEAVE_CANCEL_FORBIDDEN', message: 'Bạn chỉ có thể hủy đơn nghỉ của chính mình.' });
      const policy = await manager.getRepository(LeavePolicyEntity).findOne({ where: { id: request.policyId } });
      if (!policy) this.policyNotFound();
      if (!canCancelLeave(request.status, policy.allowApprovedCancellation)) throw new ConflictException({ code: 'LEAVE_CANNOT_BE_CANCELLED', message: request.status === 'APPROVED' ? 'Chính sách không cho phép hủy đơn đã duyệt.' : 'Đơn này không còn ở trạng thái có thể hủy.' });
      await this.assertOpenPeriod(manager, request.startDate, request.endDate);
      const oldValue = { status: request.status };
      request.status = 'CANCELLED'; request.cancelledAt = new Date(); request.cancelledBy = user.id; request.cancellationReason = input.reason.trim();
      if (request.approvalStage) { request.approvalStage = 'COMPLETED'; request.routeVersion++; }
      const saved = await manager.getRepository(LeaveRequestEntity).save(request);
      await this.audit(manager, user.id, 'LEAVE_REQUEST', id, 'CANCEL', oldValue, { status: saved.status, cancellationReason: saved.cancellationReason, cancelledAt: saved.cancelledAt });
      return saved;
    });
  }

  private async createForEmployee(user: AuthenticatedUserView, employeeId: string, input: CreateOwnLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (!isValidLeaveDateRange(input.startDate, input.endDate)) throw new BadRequestException({ code: 'INVALID_LEAVE_RANGE', message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' });
    const pushes: Array<{ announcement: AnnouncementEntity; employeeIds: string[] }> = [];
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`leave-route:${employeeId}`]);
      const [employee] = await manager.query<Array<{ id: string }>>('SELECT id FROM employees WHERE id=$1 AND is_active=true', [employeeId]);
      if (!employee) throw new BadRequestException({ code: 'LEAVE_EMPLOYEE_INVALID', message: 'Nhân viên không tồn tại hoặc đã bị khóa.' });
      const policy = await this.resolvePolicy(manager, input);
      const duration = await this.resolveDuration(manager, employeeId, policy, input);
      await this.assertOpenPeriod(manager, input.startDate, input.endDate);
      const overlap = await manager.getRepository(LeaveRequestEntity).createQueryBuilder('leave').where('leave.employee_id=:employeeId', { employeeId }).andWhere("leave.status IN ('SUBMITTED','APPROVED')").andWhere('leave.start_date <= :endDate AND leave.end_date >= :startDate', { startDate: input.startDate, endDate: input.endDate }).getOne();
      if (overlap) throw new ConflictException({ code: 'LEAVE_DATE_OVERLAP', message: 'Khoảng nghỉ trùng với đơn đang chờ hoặc đã duyệt.' });
      if (policy.balanceTrackingEnabled) {
        const { balance } = await this.ensureBalance(manager, employeeId, policy, Number(input.startDate.slice(0, 4)));
        const usage = await this.balanceUsage(manager, balance);
        const available = availableLeaveMinutes({ entitlement: balance.entitlementMinutes, carryOver: balance.carryOverMinutes, adjustments: usage.adjustments, approved: usage.approved, pending: usage.pending });
        if (available < duration.requestedMinutes) throw new ConflictException({ code: 'LEAVE_BALANCE_INSUFFICIENT', message: `Số dư phép không đủ. Còn ${available} phút, đơn cần ${duration.requestedMinutes} phút.` });
      }
      const request = manager.getRepository(LeaveRequestEntity).create({ employeeId, policyId: policy.id, leaveType: policy.code, startDate: input.startDate, endDate: input.endDate, reason: input.reason.trim(), status: 'SUBMITTED', submittedBy: user.id, submittedAt: new Date(), ...duration });
      const saved = await manager.getRepository(LeaveRequestEntity).save(request);
      await this.audit(manager, user.id, 'LEAVE_REQUEST', saved.id, 'SUBMIT', null, { employeeId, policyId: policy.id, leaveType: saved.leaveType, durationType: saved.durationType, requestedMinutes: saved.requestedMinutes, startDate: saved.startDate, endDate: saved.endDate, status: saved.status });
      await this.workflow.initialize(manager, saved, user.id, pushes);
      return saved;
    });
    await this.workflow.deliver(pushes);
    return result;
  }

  private async resolvePolicy(manager: EntityManager, input: CreateOwnLeaveRequestDto): Promise<LeavePolicyEntity> {
    const repository = manager.getRepository(LeavePolicyEntity);
    const policy = input.policyId ? await repository.findOne({ where: { id: input.policyId, isActive: true } }) : input.leaveType ? await repository.findOne({ where: { code: input.leaveType.trim().toUpperCase(), isActive: true } }) : null;
    if (!policy) throw new BadRequestException({ code: 'LEAVE_POLICY_REQUIRED', message: 'Phải chọn một chính sách nghỉ đang hoạt động.' });
    return policy;
  }

  private async resolveDuration(manager: EntityManager, employeeId: string, policy: LeavePolicyEntity, input: CreateOwnLeaveRequestDto): Promise<LeaveDurationResult> {
    const durationType = input.durationType ?? 'FULL_DAY';
    if (!isValidLeaveDurationInput({ allowHalfDay: policy.allowHalfDay, allowHourly: policy.allowHourly, durationType, startDate: input.startDate, endDate: input.endDate, halfDayPeriod: input.halfDayPeriod, startTime: input.startTime, endTime: input.endTime })) throw new BadRequestException({ code: 'LEAVE_DURATION_INVALID', message: 'Hình thức hoặc thời gian nghỉ không phù hợp với chính sách.' });
    if (policy.balanceTrackingEnabled && input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) throw new BadRequestException({ code: 'LEAVE_BALANCE_YEAR_CROSSING', message: 'Đơn có theo dõi số dư không được đi qua hai năm; hãy tách thành hai đơn.' });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    if (!satisfiesMinimumNotice(input.startDate, today, policy.minimumNoticeDays)) throw new ConflictException({ code: 'LEAVE_MINIMUM_NOTICE_NOT_MET', message: `Chính sách yêu cầu gửi trước ít nhất ${policy.minimumNoticeDays} ngày.` });
    if (durationType === 'HOURS') {
      const requestedMinutes = minutesBetween(input.startTime!, input.endTime!);
      const dayMinutes = await this.resolveScheduledMinutes(manager, employeeId, input.startDate) ?? policy.dayMinutes;
      if (requestedMinutes > dayMinutes) throw new BadRequestException({ code: 'LEAVE_HOURLY_DURATION_EXCEEDS_DAY', message: 'Thời lượng nghỉ theo giờ vượt quá thời lượng ngày làm việc.' });
      return { durationType, requestedMinutes, halfDayPeriod: null, startTime: input.startTime!, endTime: input.endTime! };
    }
    if (durationType === 'HALF_DAY') {
      const dayMinutes = await this.resolveScheduledMinutes(manager, employeeId, input.startDate) ?? policy.dayMinutes;
      return { durationType, requestedMinutes: Math.ceil(dayMinutes / 2), halfDayPeriod: input.halfDayPeriod!, startTime: null, endTime: null };
    }
    const [row] = await manager.query<Array<{ minutes: number }>>(`WITH days AS (SELECT day::date FROM generate_series($2::date,$3::date,'1 day') day), scheduled AS (SELECT d.day,(SELECT ws.required_work_minutes FROM (SELECT es.schedule_id,es.effective_from,1 priority FROM employee_schedules es WHERE es.employee_id=$1 AND es.effective_from<=d.day AND (es.effective_to IS NULL OR es.effective_to>=d.day) UNION ALL SELECT ds.schedule_id,ds.effective_from,2 priority FROM employee_organization_assignments oa JOIN department_schedules ds ON ds.branch_id=oa.branch_id AND ds.department_id=oa.department_id WHERE oa.employee_id=$1 AND oa.effective_from<=d.day AND (oa.effective_to IS NULL OR oa.effective_to>=d.day) AND ds.effective_from<=d.day AND (ds.effective_to IS NULL OR ds.effective_to>=d.day)) c JOIN work_schedules ws ON ws.id=c.schedule_id WHERE ws.is_active=true AND extract(isodow from d.day)::int=ANY(ws.weekdays) ORDER BY c.priority,c.effective_from DESC LIMIT 1) minutes FROM days d) SELECT COALESCE(SUM(minutes),0)::int minutes FROM scheduled WHERE minutes IS NOT NULL`, [employeeId, input.startDate, input.endDate]);
    const requestedMinutes = (row?.minutes ?? 0) > 0 ? row.minutes : this.inclusiveDays(input.startDate, input.endDate) * policy.dayMinutes;
    return { durationType, requestedMinutes, halfDayPeriod: null, startTime: null, endTime: null };
  }

  private resolveScheduledMinutes(manager: EntityManager, employeeId: string, date: string): Promise<number | null> {
    return manager.query<Array<{ minutes: number }>>(`WITH org AS (SELECT branch_id,department_id FROM employee_organization_assignments WHERE employee_id=$1 AND effective_from<=$2::date AND (effective_to IS NULL OR effective_to>=$2::date) ORDER BY is_primary DESC,effective_from DESC LIMIT 1), candidates AS (SELECT es.schedule_id,es.effective_from,1 priority FROM employee_schedules es WHERE es.employee_id=$1 AND es.effective_from<=$2::date AND (es.effective_to IS NULL OR es.effective_to>=$2::date) UNION ALL SELECT ds.schedule_id,ds.effective_from,2 priority FROM department_schedules ds JOIN org o ON o.branch_id=ds.branch_id AND o.department_id=ds.department_id WHERE ds.effective_from<=$2::date AND (ds.effective_to IS NULL OR ds.effective_to>=$2::date)) SELECT ws.required_work_minutes::int minutes FROM candidates c JOIN work_schedules ws ON ws.id=c.schedule_id WHERE ws.is_active=true AND extract(isodow from $2::date)::int=ANY(ws.weekdays) ORDER BY c.priority,c.effective_from DESC LIMIT 1`, [employeeId, date]).then((rows: Array<{ minutes: number }>) => rows[0]?.minutes ?? null);
  }

  private async assertBalanceAvailableForRequest(manager: EntityManager, request: LeaveRequestEntity): Promise<void> {
    const policy = await manager.getRepository(LeavePolicyEntity).findOne({ where: { id: request.policyId } });
    if (!policy?.balanceTrackingEnabled) return;
    const { balance } = await this.ensureBalance(manager, request.employeeId, policy, Number(request.startDate.slice(0, 4)));
    const usage = await this.balanceUsage(manager, balance);
    const available = availableLeaveMinutes({ entitlement: balance.entitlementMinutes, carryOver: balance.carryOverMinutes, adjustments: usage.adjustments, approved: usage.approved, pending: usage.pending });
    if (available < 0) throw new ConflictException({ code: 'LEAVE_BALANCE_INSUFFICIENT', message: 'Số dư phép đã thay đổi và không còn đủ để duyệt đơn này.' });
  }

  private async ensureBalance(manager: EntityManager, employeeId: string, policy: LeavePolicyEntity, year: number): Promise<{ balance: EmployeeLeaveBalanceEntity; created: boolean }> {
    const repository = manager.getRepository(EmployeeLeaveBalanceEntity);
    const existing = await repository.findOne({ where: { employeeId, policyId: policy.id, balanceYear: year }, lock: { mode: 'pessimistic_write' } });
    if (existing) return { balance: existing, created: false };
    let carryOverMinutes = 0;
    if (policy.carryOverEnabled) {
      const [previous] = await manager.query<Array<{ remaining: number }>>(`SELECT GREATEST(0,b.entitlement_minutes+b.carry_over_minutes+COALESCE((SELECT SUM(a.delta_minutes) FROM leave_balance_adjustments a WHERE a.balance_id=b.id),0)-COALESCE((SELECT SUM(l.requested_minutes) FROM leave_requests l WHERE l.employee_id=b.employee_id AND l.policy_id=b.policy_id AND l.status IN ('SUBMITTED','APPROVED') AND EXTRACT(YEAR FROM l.start_date)::int=b.balance_year),0))::int remaining FROM employee_leave_balances b WHERE b.employee_id=$1 AND b.policy_id=$2 AND b.balance_year=$3`, [employeeId, policy.id, year - 1]);
      carryOverMinutes = Math.min(previous?.remaining ?? 0, policy.maxCarryOverMinutes);
    }
    const inserted = await manager.query<Array<{ id: string }>>(
      `INSERT INTO employee_leave_balances (employee_id,policy_id,balance_year,entitlement_minutes,carry_over_minutes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (employee_id,policy_id,balance_year) DO NOTHING
       RETURNING id`,
      [employeeId, policy.id, year, policy.annualEntitlementMinutes, carryOverMinutes],
    );
    const balance = await repository.findOne({ where: { employeeId, policyId: policy.id, balanceYear: year }, lock: { mode: 'pessimistic_write' } });
    if (!balance) throw new ConflictException({ code: 'LEAVE_BALANCE_INITIALIZATION_FAILED', message: 'Khong the khoi tao so du phep.' });
    return { balance, created: inserted.length > 0 };
  }

  private async balanceUsage(manager: EntityManager, balance: EmployeeLeaveBalanceEntity): Promise<{ adjustments: number; approved: number; pending: number }> {
    const [usage] = await manager.query<Array<{ adjustments: number; approved: number; pending: number }>>(`SELECT COALESCE((SELECT SUM(delta_minutes) FROM leave_balance_adjustments WHERE balance_id=$1),0)::int adjustments,COALESCE((SELECT SUM(requested_minutes) FROM leave_requests WHERE employee_id=$2 AND policy_id=$3 AND status='APPROVED' AND EXTRACT(YEAR FROM start_date)::int=$4),0)::int approved,COALESCE((SELECT SUM(requested_minutes) FROM leave_requests WHERE employee_id=$2 AND policy_id=$3 AND status='SUBMITTED' AND EXTRACT(YEAR FROM start_date)::int=$4),0)::int pending`, [balance.id, balance.employeeId, balance.policyId, balance.balanceYear]);
    return usage ?? { adjustments: 0, approved: 0, pending: 0 };
  }

  private balanceQuery(year: number, employeeId?: string): Promise<unknown[]> {
    return this.dataSource.query(`SELECT e.id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "employeeName",d.name AS "departmentName",p.id AS "policyId",p.code AS "policyCode",p.name AS "policyName",p.day_minutes AS "dayMinutes",b.id AS "balanceId",(b.id IS NOT NULL) AS "initialized",COALESCE(b.entitlement_minutes,p.annual_entitlement_minutes)::int AS "entitlementMinutes",COALESCE(b.carry_over_minutes,0)::int AS "carryOverMinutes",COALESCE(adj.minutes,0)::int AS "adjustmentMinutes",COALESCE(used.approved,0)::int AS "approvedMinutes",COALESCE(used.pending,0)::int AS "pendingMinutes",(COALESCE(b.entitlement_minutes,p.annual_entitlement_minutes)+COALESCE(b.carry_over_minutes,0)+COALESCE(adj.minutes,0)-COALESCE(used.approved,0)-COALESCE(used.pending,0))::int AS "availableMinutes" FROM employees e CROSS JOIN leave_policies p LEFT JOIN employee_leave_balances b ON b.employee_id=e.id AND b.policy_id=p.id AND b.balance_year=$1 LEFT JOIN LATERAL (SELECT SUM(delta_minutes)::int minutes FROM leave_balance_adjustments WHERE balance_id=b.id) adj ON true LEFT JOIN LATERAL (SELECT SUM(requested_minutes) FILTER (WHERE status='APPROVED')::int approved,SUM(requested_minutes) FILTER (WHERE status='SUBMITTED')::int pending FROM leave_requests WHERE employee_id=e.id AND policy_id=p.id AND EXTRACT(YEAR FROM start_date)::int=$1) used ON true LEFT JOIN departments d ON d.id=e.department_id WHERE e.is_active=true AND p.is_active=true AND p.balance_tracking_enabled=true AND ($2::uuid IS NULL OR e.id=$2) ORDER BY e.full_name,p.name`, [year, employeeId ?? null]);
  }

  private validatePolicy(policy: Pick<LeavePolicyEntity, 'allowHalfDay' | 'allowHourly' | 'annualEntitlementMinutes' | 'balanceTrackingEnabled' | 'carryOverEnabled' | 'dayMinutes' | 'maxCarryOverMinutes' | 'minimumNoticeDays'>): void {
    if (policy.carryOverEnabled && !policy.balanceTrackingEnabled) throw new BadRequestException({ code: 'LEAVE_POLICY_CARRY_OVER_REQUIRES_BALANCE', message: 'Phải bật theo dõi số dư trước khi bật cộng dồn.' });
    if (!Number.isInteger(policy.dayMinutes) || policy.dayMinutes < 1 || policy.dayMinutes > 1440 || policy.annualEntitlementMinutes < 0 || policy.maxCarryOverMinutes < 0 || policy.minimumNoticeDays < 0) throw new BadRequestException({ code: 'LEAVE_POLICY_INVALID', message: 'Thông số chính sách nghỉ không hợp lệ.' });
  }

  private async assertOpenPeriod(manager: EntityManager, startDate: string, endDate: string): Promise<void> {
    await manager.query(`INSERT INTO attendance_periods(period_month,status) SELECT m::date,'OPEN' FROM generate_series(date_trunc('month',$1::date),date_trunc('month',$2::date),'1 month') m ON CONFLICT(period_month) DO NOTHING`, [startDate,endDate]);
    await manager.query(`SELECT id FROM attendance_periods WHERE period_month BETWEEN date_trunc('month',$1::date) AND date_trunc('month',$2::date) ORDER BY period_month FOR UPDATE`, [startDate,endDate]);
    const [locked] = await manager.query<Array<{ periodMonth: string }>>(`SELECT period_month::text AS "periodMonth" FROM attendance_periods WHERE status='LOCKED' AND period_month BETWEEN date_trunc('month',$1::date)::date AND date_trunc('month',$2::date)::date ORDER BY period_month LIMIT 1`, [startDate, endDate]);
    if (locked) throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: `Kỳ công ${locked.periodMonth.slice(0, 7)} đã chốt; không thể thay đổi đơn nghỉ.` });
  }

  private inclusiveDays(startDate: string, endDate: string): number { return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1; }
  private policySummary(policy: LeavePolicyEntity): Record<string, unknown> { return { code: policy.code, name: policy.name, isActive: policy.isActive, balanceTrackingEnabled: policy.balanceTrackingEnabled, annualEntitlementMinutes: policy.annualEntitlementMinutes, dayMinutes: policy.dayMinutes, carryOverEnabled: policy.carryOverEnabled, maxCarryOverMinutes: policy.maxCarryOverMinutes, allowHalfDay: policy.allowHalfDay, allowHourly: policy.allowHourly, allowApprovedCancellation: policy.allowApprovedCancellation, minimumNoticeDays: policy.minimumNoticeDays }; }
  private balanceSummary(balance: EmployeeLeaveBalanceEntity): Record<string, unknown> { return { employeeId: balance.employeeId, policyId: balance.policyId, balanceYear: balance.balanceYear, entitlementMinutes: balance.entitlementMinutes, carryOverMinutes: balance.carryOverMinutes }; }
  private audit(manager: EntityManager, userId: string, resourceType: string, resourceId: string, action: string, oldValue: unknown, newValue: unknown): Promise<ConfigurationAuditLogEntity> { return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, { resourceType, resourceId, action, oldValue, newValue, createdBy: userId })); }
  private employeeProfileRequired(): never { throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' }); }
  private policyNotFound(): never { throw new NotFoundException({ code: 'LEAVE_POLICY_NOT_FOUND', message: 'Không tìm thấy chính sách nghỉ.' }); }
  private requestNotFound(): never { throw new NotFoundException({ code: 'LEAVE_REQUEST_NOT_FOUND', message: 'Không tìm thấy đơn nghỉ.' }); }
}
