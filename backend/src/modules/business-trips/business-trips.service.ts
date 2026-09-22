import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessTripEntity, BusinessTripMemberEntity, CustomerEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type { CreateBusinessTripDto, CreateCustomerDto, TransitionBusinessTripDto } from './business-trips.dto.js';
import { canTransitionBusinessTrip } from './domain/business-trip-status.js';

@Injectable()
export class BusinessTripsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BusinessTripEntity) private readonly trips: Repository<BusinessTripEntity>,
    @InjectRepository(BusinessTripMemberEntity) private readonly members: Repository<BusinessTripMemberEntity>,
    @InjectRepository(CustomerEntity) private readonly customers: Repository<CustomerEntity>,
  ) {}

  list(): Promise<unknown[]> {
    return this.dataSource.query<unknown[]>(`SELECT bt.*, c.name AS "customerName", COUNT(btm.employee_id)::int AS "memberCount", COALESCE(string_agg(e.full_name, ', ' ORDER BY e.full_name), '') AS "memberNames" FROM business_trips bt LEFT JOIN customers c ON c.id=bt.customer_id LEFT JOIN business_trip_members btm ON btm.business_trip_id=bt.id LEFT JOIN employees e ON e.id=btm.employee_id GROUP BY bt.id,c.name ORDER BY bt.start_at DESC`);
  }

  listCustomers(): Promise<CustomerEntity[]> { return this.customers.find({ order: { name: 'ASC' } }); }
  createCustomer(input: CreateCustomerDto): Promise<CustomerEntity> { return this.customers.save(this.customers.create(input)); }

  async create(user: AuthenticatedUserView, input: CreateBusinessTripDto): Promise<BusinessTripEntity> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (endAt <= startAt) throw new BadRequestException({ code: 'INVALID_TRIP_TIME', message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
    try {
      return await this.dataSource.transaction(async (manager) => {
        const trip = await manager.getRepository(BusinessTripEntity).save(manager.getRepository(BusinessTripEntity).create({ ...input, code: input.code.trim().toUpperCase(), customerId: input.customerId ?? null, startAt, endAt, status: 'DRAFT', createdBy: user.id }));
        const memberIds = [...new Set(input.memberIds)];
        await manager.getRepository(BusinessTripMemberEntity).save(memberIds.map((employeeId) => ({ businessTripId: trip.id, employeeId, participationStatus: 'ASSIGNED' })));
        return trip;
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ConflictException({ code: 'BUSINESS_TRIP_CONFLICT', message: 'Mã phiếu công tác đã tồn tại hoặc thành viên không hợp lệ.' });
    }
  }

  async transition(id: string, input: TransitionBusinessTripDto): Promise<BusinessTripEntity> {
    const trip = await this.trips.findOne({ where: { id } });
    if (!trip) throw new NotFoundException({ code: 'BUSINESS_TRIP_NOT_FOUND', message: 'Không tìm thấy phiếu công tác.' });
    if (!canTransitionBusinessTrip(trip.status, input.status)) throw new ConflictException({ code: 'INVALID_BUSINESS_TRIP_TRANSITION', message: `Không thể chuyển từ ${trip.status} sang ${input.status}.` });
    trip.status = input.status;
    await this.members.update({ businessTripId: id }, { participationStatus: input.status });
    return this.trips.save(trip);
  }
}
