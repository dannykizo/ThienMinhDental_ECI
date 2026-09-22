import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ConfigurationAuditLogEntity,
  DepartmentScheduleEntity,
  EmployeeScheduleEntity,
  WorkScheduleEntity,
} from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type {
  AssignDepartmentScheduleDto,
  AssignEmployeeScheduleDto,
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
} from './work-schedules.dto.js';

type AssignmentScope =
  | { kind: 'EMPLOYEE'; employeeId: string }
  | { kind: 'DEPARTMENT'; branchId: string; departmentId: string };

@Injectable()
export class WorkSchedulesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(WorkScheduleEntity) private readonly schedules: Repository<WorkScheduleEntity>,
  ) {}

  async list(): Promise<unknown[]> {
    const schedules = await this.schedules.find({ order: { name: 'ASC' } });
    if (schedules.length === 0) return [];
    const ids = schedules.map(({ id }) => id);
    const departmentAssignments = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT ds.id, ds.schedule_id AS "scheduleId", ds.branch_id AS "branchId",
        b.name AS "branchName", ds.department_id AS "departmentId", d.name AS "departmentName",
        ds.effective_from::text AS "effectiveFrom", ds.effective_to::text AS "effectiveTo"
       FROM department_schedules ds
       JOIN branches b ON b.id = ds.branch_id
       JOIN departments d ON d.id = ds.department_id
       WHERE ds.schedule_id = ANY($1::uuid[])
       ORDER BY ds.effective_from DESC`,
      [ids],
    );
    const employeeCounts = await this.dataSource.query<Array<{ scheduleId: string; count: string }>>(
      `SELECT schedule_id AS "scheduleId", count(*)::text AS count
       FROM employee_schedules WHERE schedule_id = ANY($1::uuid[]) GROUP BY schedule_id`,
      [ids],
    );
    const countBySchedule = new Map(employeeCounts.map((row) => [row.scheduleId, Number(row.count)]));
    return schedules.map((schedule) => ({
      ...schedule,
      departmentAssignments: departmentAssignments.filter((row) => row.scheduleId === schedule.id),
      employeeAssignmentCount: countBySchedule.get(schedule.id) ?? 0,
    }));
  }

  async create(user: AuthenticatedUserView, input: CreateWorkScheduleDto): Promise<WorkScheduleEntity> {
    this.validateTime(input.startTime, input.endTime);
    return this.dataSource.transaction(async (manager) => {
      const schedule = await manager.save(WorkScheduleEntity, manager.create(WorkScheduleEntity, {
        ...input,
        weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b),
        lateToleranceMinutes: input.lateToleranceMinutes ?? 3,
        earlyLeaveToleranceMinutes: input.earlyLeaveToleranceMinutes ?? 0,
        requiredWorkMinutes: input.requiredWorkMinutes ?? 480,
        isActive: true,
      }));
      await this.audit(manager, user.id, 'WORK_SCHEDULE', schedule.id, 'CREATE', null, schedule);
      return schedule;
    });
  }

  async update(user: AuthenticatedUserView, id: string, input: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WorkScheduleEntity);
      const schedule = await repository.findOne({ where: { id } });
      if (!schedule) throw new NotFoundException({ code: 'SCHEDULE_NOT_FOUND', message: 'Không tìm thấy lịch làm việc.' });
      const oldValue = { ...schedule };
      const startTime = input.startTime ?? schedule.startTime;
      const endTime = input.endTime ?? schedule.endTime;
      this.validateTime(startTime, endTime);
      Object.assign(schedule, input);
      if (input.weekdays) schedule.weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
      const saved = await repository.save(schedule);
      await this.audit(manager, user.id, 'WORK_SCHEDULE', saved.id, 'UPDATE', oldValue, saved);
      return saved;
    });
  }

  assignEmployee(user: AuthenticatedUserView, scheduleId: string, input: AssignEmployeeScheduleDto): Promise<EmployeeScheduleEntity> {
    return this.assign(user, scheduleId, input, { kind: 'EMPLOYEE', employeeId: input.employeeId }) as Promise<EmployeeScheduleEntity>;
  }

  assignDepartment(user: AuthenticatedUserView, scheduleId: string, input: AssignDepartmentScheduleDto): Promise<DepartmentScheduleEntity> {
    return this.assign(user, scheduleId, input, {
      kind: 'DEPARTMENT',
      branchId: input.branchId,
      departmentId: input.departmentId,
    }) as Promise<DepartmentScheduleEntity>;
  }

  history(): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT l.id, l.resource_type AS "resourceType", l.resource_id AS "resourceId",
        l.action, l.old_value AS "oldValue", l.new_value AS "newValue",
        l.created_at AS "createdAt", COALESCE(e.full_name, u.email) AS "actorName"
       FROM configuration_audit_logs l
       JOIN users u ON u.id = l.created_by
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE l.resource_type IN ('WORK_SCHEDULE', 'EMPLOYEE_SCHEDULE', 'DEPARTMENT_SCHEDULE')
       ORDER BY l.created_at DESC LIMIT 100`,
    );
  }

  private async assign<T extends AssignEmployeeScheduleDto | AssignDepartmentScheduleDto>(
    user: AuthenticatedUserView,
    scheduleId: string,
    input: T,
    scope: AssignmentScope,
  ): Promise<EmployeeScheduleEntity | DepartmentScheduleEntity> {
    this.validateRange(input.effectiveFrom, input.effectiveTo);
    return this.dataSource.transaction(async (manager) => {
      const schedule = await manager.findOne(WorkScheduleEntity, { where: { id: scheduleId, isActive: true } });
      if (!schedule) throw new NotFoundException({ code: 'SCHEDULE_NOT_FOUND', message: 'Không tìm thấy lịch làm việc đang hoạt động.' });

      await this.closePreviousOpenAssignment(manager, scope, input.effectiveFrom);
      const overlap = await this.findOverlap(manager, scope, input.effectiveFrom, input.effectiveTo);
      if (overlap) throw new ConflictException({ code: 'SCHEDULE_ASSIGNMENT_OVERLAP', message: 'Đã có lịch trong khoảng hiệu lực này.' });

      if (scope.kind === 'EMPLOYEE') {
        const assignment = await manager.save(EmployeeScheduleEntity, manager.create(EmployeeScheduleEntity, {
          scheduleId,
          employeeId: scope.employeeId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        }));
        await this.audit(manager, user.id, 'EMPLOYEE_SCHEDULE', assignment.id, 'ASSIGN', null, assignment);
        return assignment;
      }

      const assignment = await manager.save(DepartmentScheduleEntity, manager.create(DepartmentScheduleEntity, {
        scheduleId,
        branchId: scope.branchId,
        departmentId: scope.departmentId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      }));
      await this.audit(manager, user.id, 'DEPARTMENT_SCHEDULE', assignment.id, 'ASSIGN', null, assignment);
      return assignment;
    });
  }

  private async closePreviousOpenAssignment(manager: EntityManager, scope: AssignmentScope, effectiveFrom: string): Promise<void> {
    const table = scope.kind === 'EMPLOYEE' ? 'employee_schedules' : 'department_schedules';
    const conditions = scope.kind === 'EMPLOYEE'
      ? ['employee_id = $1']
      : ['branch_id = $1', 'department_id = $2'];
    const params = scope.kind === 'EMPLOYEE'
      ? [scope.employeeId, effectiveFrom]
      : [scope.branchId, scope.departmentId, effectiveFrom];
    const dateParameter = params.length;
    await manager.query(
      `UPDATE ${table} SET effective_to = ($${dateParameter}::date - INTERVAL '1 day')::date
       WHERE ${conditions.join(' AND ')} AND effective_to IS NULL AND effective_from < $${dateParameter}::date`,
      params,
    );
  }

  private async findOverlap(manager: EntityManager, scope: AssignmentScope, effectiveFrom: string, effectiveTo?: string): Promise<unknown> {
    const table = scope.kind === 'EMPLOYEE' ? 'employee_schedules' : 'department_schedules';
    const conditions = scope.kind === 'EMPLOYEE'
      ? ['employee_id = $1']
      : ['branch_id = $1', 'department_id = $2'];
    const values = scope.kind === 'EMPLOYEE'
      ? [scope.employeeId, effectiveFrom, effectiveTo ?? null]
      : [scope.branchId, scope.departmentId, effectiveFrom, effectiveTo ?? null];
    const fromIndex = scope.kind === 'EMPLOYEE' ? 2 : 3;
    const toIndex = fromIndex + 1;
    const result: unknown = await manager.query(
      `SELECT id FROM ${table} WHERE ${conditions.join(' AND ')}
       AND effective_from <= COALESCE($${toIndex}::date, DATE '9999-12-31')
       AND COALESCE(effective_to, DATE '9999-12-31') >= $${fromIndex}::date LIMIT 1`,
      values,
    );
    return Array.isArray(result) ? result[0] : undefined;
  }

  private validateTime(startTime: string, endTime: string): void {
    if (endTime <= startTime) throw new BadRequestException({ code: 'INVALID_SCHEDULE_TIME', message: 'Giờ kết thúc phải sau giờ bắt đầu.' });
  }

  private validateRange(effectiveFrom: string, effectiveTo?: string): void {
    if (effectiveTo && effectiveTo < effectiveFrom) throw new BadRequestException({ code: 'INVALID_EFFECTIVE_RANGE', message: 'Ngày kết thúc hiệu lực không hợp lệ.' });
  }

  private audit(manager: EntityManager, userId: string, resourceType: string, resourceId: string, action: string, oldValue: unknown, newValue: unknown): Promise<ConfigurationAuditLogEntity> {
    return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, {
      resourceType,
      resourceId,
      action,
      oldValue,
      newValue,
      createdBy: userId,
    }));
  }
}
