import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequestEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type { CreateLeaveRequestDto, ReviewLeaveRequestDto } from './leave.dto.js';

@Injectable()
export class LeaveService {
  constructor(@InjectRepository(LeaveRequestEntity) private readonly requests: Repository<LeaveRequestEntity>) {}
  list(): Promise<LeaveRequestEntity[]> { return this.requests.find({ order: { createdAt: 'DESC' } }); }

  async create(input: CreateLeaveRequestDto): Promise<LeaveRequestEntity> {
    if (input.endDate < input.startDate) throw new BadRequestException({ code: 'INVALID_LEAVE_RANGE', message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' });
    const overlap = await this.requests.createQueryBuilder('leave')
      .where('leave.employee_id=:employeeId', { employeeId: input.employeeId })
      .andWhere("leave.status IN ('SUBMITTED','APPROVED')")
      .andWhere('leave.start_date <= :endDate AND leave.end_date >= :startDate', { startDate: input.startDate, endDate: input.endDate })
      .getOne();
    if (overlap) throw new ConflictException({ code: 'LEAVE_DATE_OVERLAP', message: 'Khoảng nghỉ trùng với đơn đang chờ hoặc đã duyệt.' });
    return this.requests.save(this.requests.create({ ...input, status: 'SUBMITTED' }));
  }

  async review(id: string, user: AuthenticatedUserView, input: ReviewLeaveRequestDto): Promise<LeaveRequestEntity> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException({ code: 'LEAVE_REQUEST_NOT_FOUND', message: 'Không tìm thấy đơn nghỉ.' });
    if (request.status !== 'SUBMITTED') throw new ConflictException({ code: 'LEAVE_ALREADY_REVIEWED', message: 'Chỉ đơn đang chờ mới được duyệt hoặc từ chối.' });
    request.status = input.status;
    request.reviewNote = input.reviewNote ?? null;
    request.reviewedBy = user.id;
    request.reviewedAt = new Date();
    return this.requests.save(request);
  }
}
