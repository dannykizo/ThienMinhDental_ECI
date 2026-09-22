import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeScheduleEntity, WorkScheduleEntity } from '../../database/entities/workforce.entity.js';
import type { AssignScheduleDto, CreateWorkScheduleDto, UpdateWorkScheduleDto } from './work-schedules.dto.js';

@Injectable()
export class WorkSchedulesService {
  constructor(
    @InjectRepository(WorkScheduleEntity) private readonly schedules: Repository<WorkScheduleEntity>,
    @InjectRepository(EmployeeScheduleEntity) private readonly assignments: Repository<EmployeeScheduleEntity>,
  ) {}

  list(): Promise<WorkScheduleEntity[]> { return this.schedules.find({ order: { name: 'ASC' } }); }

  create(input: CreateWorkScheduleDto): Promise<WorkScheduleEntity> {
    if (input.endTime <= input.startTime) throw new BadRequestException({ code: 'INVALID_SCHEDULE_TIME', message: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    return this.schedules.save(this.schedules.create({ ...input, weekdays: [...new Set(input.weekdays)].sort(), isActive: true }));
  }

  async update(id: string, input: UpdateWorkScheduleDto): Promise<WorkScheduleEntity> {
    const schedule = await this.schedules.findOne({ where: { id } });
    if (!schedule) throw new NotFoundException({ code: 'SCHEDULE_NOT_FOUND', message: 'Không tìm thấy lịch làm việc.' });
    const startTime = input.startTime ?? schedule.startTime;
    const endTime = input.endTime ?? schedule.endTime;
    if (endTime <= startTime) throw new BadRequestException({ code: 'INVALID_SCHEDULE_TIME', message: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    Object.assign(schedule, input);
    return this.schedules.save(schedule);
  }

  async assign(scheduleId: string, input: AssignScheduleDto): Promise<EmployeeScheduleEntity> {
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new BadRequestException({ code: 'INVALID_EFFECTIVE_RANGE', message: 'Ngày kết thúc hiệu lực không hợp lệ.' });
    const schedule = await this.schedules.findOne({ where: { id: scheduleId, isActive: true } });
    if (!schedule) throw new NotFoundException({ code: 'SCHEDULE_NOT_FOUND', message: 'Không tìm thấy lịch làm việc.' });
    const overlap = await this.assignments.createQueryBuilder('assignment')
      .where('assignment.employee_id = :employeeId', { employeeId: input.employeeId })
      .andWhere('assignment.effective_from <= COALESCE(:effectiveTo, DATE \'9999-12-31\')', { effectiveTo: input.effectiveTo ?? null })
      .andWhere('COALESCE(assignment.effective_to, DATE \'9999-12-31\') >= :effectiveFrom', { effectiveFrom: input.effectiveFrom })
      .getOne();
    if (overlap) throw new ConflictException({ code: 'SCHEDULE_ASSIGNMENT_OVERLAP', message: 'Nhân viên đã có lịch trong khoảng hiệu lực này.' });
    return this.assignments.save(this.assignments.create({ scheduleId, ...input, effectiveTo: input.effectiveTo ?? null }));
  }
}
