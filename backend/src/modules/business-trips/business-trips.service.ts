import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AttendanceEventEntity, BusinessTripEntity, BusinessTripMemberEntity, ConfigurationAuditLogEntity, CustomerEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import type { CompleteBusinessTripDto, CreateBusinessTripDto, CreateCustomerDto, StartBusinessTripDto, TransitionBusinessTripDto, UpdateBusinessTripDto } from './business-trips.dto.js';
import { canCompleteBusinessTripMember, canStartBusinessTripMember, canTransitionBusinessTrip, hasValidBusinessTripEvidence, shouldCompleteBusinessTrip } from './domain/business-trip-status.js';

@Injectable()
export class BusinessTripsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CustomerEntity) private readonly customers: Repository<CustomerEntity>,
  ) {}

  list(): Promise<unknown[]> {
    return this.dataSource.query(`SELECT bt.id,bt.code,bt.customer_id AS "customerId",bt.responsible_employee_id AS "responsibleEmployeeId",bt.site_name AS "siteName",bt.site_address AS "siteAddress",bt.start_at AS "startAt",bt.end_at AS "endAt",bt.content,bt.requires_photo AS "requiresPhoto",bt.status,bt.cancel_reason AS "cancelReason",bt.created_at AS "createdAt",bt.updated_at AS "updatedAt",c.name AS "customerName",c.contact_name AS "customerContactName",c.contact_phone AS "customerContactPhone",responsible.full_name AS "responsibleEmployeeName",COUNT(btm.employee_id)::int AS "memberCount",COALESCE(string_agg(e.full_name, ', ' ORDER BY e.full_name),'') AS "memberNames",COALESCE(jsonb_agg(jsonb_build_object('employeeId',e.id,'employeeCode',e.employee_code,'fullName',e.full_name,'status',btm.participation_status,'startedAt',btm.started_at,'completedAt',btm.completed_at,'note',btm.note,'evidenceImageReference',btm.evidence_image_reference,'evidenceCapturedAt',btm.evidence_captured_at)) FILTER (WHERE e.id IS NOT NULL),'[]'::jsonb) AS members FROM business_trips bt LEFT JOIN customers c ON c.id=bt.customer_id LEFT JOIN employees responsible ON responsible.id=bt.responsible_employee_id LEFT JOIN business_trip_members btm ON btm.business_trip_id=bt.id LEFT JOIN employees e ON e.id=btm.employee_id GROUP BY bt.id,c.name,c.contact_name,c.contact_phone,responsible.full_name ORDER BY bt.start_at DESC`);
  }

  listCustomers(): Promise<CustomerEntity[]> { return this.customers.find({ order: { name: 'ASC' } }); }
  createCustomer(input: CreateCustomerDto): Promise<CustomerEntity> { return this.customers.save(this.customers.create(input)); }

  async create(user: AuthenticatedUserView, input: CreateBusinessTripDto): Promise<BusinessTripEntity> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    this.validateTime(startAt, endAt);
    const memberIds = [...new Set(input.memberIds)];
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertMembers(manager, memberIds, input.responsibleEmployeeId);
        const repository = manager.getRepository(BusinessTripEntity);
        const trip = await repository.save(repository.create({ code: input.code.trim().toUpperCase(), customerId: input.customerId ?? null, responsibleEmployeeId: input.responsibleEmployeeId, siteName: input.siteName, siteAddress: input.siteAddress, startAt, endAt, content: input.content, requiresPhoto: input.requiresPhoto, status: 'DRAFT', cancelReason: null, createdBy: user.id }));
        await manager.getRepository(BusinessTripMemberEntity).save(memberIds.map((employeeId) => ({ businessTripId: trip.id, employeeId, participationStatus: 'ASSIGNED' })));
        await this.audit(manager, user.id, trip.id, 'CREATE', null, { ...trip, memberIds });
        return trip;
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new ConflictException({ code: 'BUSINESS_TRIP_CONFLICT', message: 'Mã phiếu công tác đã tồn tại hoặc dữ liệu thành viên không hợp lệ.' });
    }
  }

  async update(user: AuthenticatedUserView, id: string, input: UpdateBusinessTripDto): Promise<BusinessTripEntity> {
    return this.dataSource.transaction(async (manager) => {
      const trip = await manager.getRepository(BusinessTripEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!trip) throw new NotFoundException({ code: 'BUSINESS_TRIP_NOT_FOUND', message: 'Không tìm thấy phiếu công tác.' });
      if (trip.status !== 'DRAFT') throw new ConflictException({ code: 'BUSINESS_TRIP_NOT_DRAFT', message: 'Chỉ phiếu nháp mới được chỉnh sửa nội dung và thành viên.' });
      const oldValue = { ...trip, memberIds: await this.memberIds(manager, id) };
      const memberIds = input.memberIds ? [...new Set(input.memberIds)] : oldValue.memberIds;
      const responsibleEmployeeId = input.responsibleEmployeeId ?? trip.responsibleEmployeeId;
      if (!responsibleEmployeeId) throw new BadRequestException({ code: 'RESPONSIBLE_EMPLOYEE_REQUIRED', message: 'Phiếu công tác phải có người phụ trách.' });
      await this.assertMembers(manager, memberIds, responsibleEmployeeId);
      const startAt = input.startAt ? new Date(input.startAt) : new Date(trip.startAt);
      const endAt = input.endAt ? new Date(input.endAt) : new Date(trip.endAt);
      this.validateTime(startAt, endAt);
      Object.assign(trip, { customerId: input.customerId ?? trip.customerId, responsibleEmployeeId, siteName: input.siteName ?? trip.siteName, siteAddress: input.siteAddress ?? trip.siteAddress, startAt, endAt, content: input.content ?? trip.content, requiresPhoto: input.requiresPhoto ?? trip.requiresPhoto });
      const saved = await manager.getRepository(BusinessTripEntity).save(trip);
      if (input.memberIds) {
        await manager.delete(BusinessTripMemberEntity, { businessTripId: id });
        await manager.getRepository(BusinessTripMemberEntity).save(memberIds.map((employeeId) => ({ businessTripId: id, employeeId, participationStatus: 'ASSIGNED' })));
      }
      await this.audit(manager, user.id, id, 'UPDATE', oldValue, { ...saved, memberIds });
      return saved;
    });
  }

  async transition(user: AuthenticatedUserView, id: string, input: TransitionBusinessTripDto): Promise<BusinessTripEntity> {
    return this.dataSource.transaction(async (manager) => {
      const trip = await manager.getRepository(BusinessTripEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!trip) throw new NotFoundException({ code: 'BUSINESS_TRIP_NOT_FOUND', message: 'Không tìm thấy phiếu công tác.' });
      if (!canTransitionBusinessTrip(trip.status, input.status)) throw new ConflictException({ code: 'INVALID_BUSINESS_TRIP_TRANSITION', message: `Không thể chuyển từ ${trip.status} sang ${input.status}.` });
      if (input.status === 'CANCELLED' && !input.reason?.trim()) throw new BadRequestException({ code: 'BUSINESS_TRIP_CANCEL_REASON_REQUIRED', message: 'Lý do hủy phiếu công tác là bắt buộc.' });
      const oldValue = { status: trip.status, cancelReason: trip.cancelReason ?? null };
      trip.status = input.status;
      trip.cancelReason = input.status === 'CANCELLED' ? input.reason!.trim() : null;
      if (input.status === 'CANCELLED') await manager.query(`UPDATE business_trip_members SET participation_status='CANCELLED' WHERE business_trip_id=$1 AND participation_status<>'COMPLETED'`, [id]);
      const saved = await manager.getRepository(BusinessTripEntity).save(trip);
      await this.audit(manager, user.id, id, input.status === 'ASSIGNED' ? 'ASSIGN' : 'CANCEL', oldValue, { status: saved.status, cancelReason: saved.cancelReason });
      return saved;
    });
  }

  async listMine(user: AuthenticatedUserView): Promise<unknown[]> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.dataSource.query(`SELECT bt.id,bt.code,bt.site_name AS "siteName",bt.site_address AS "siteAddress",bt.start_at AS "startAt",bt.end_at AS "endAt",bt.content,bt.requires_photo AS "requiresPhoto",bt.status,bt.cancel_reason AS "cancelReason",c.name AS "customerName",c.contact_name AS "customerContactName",c.contact_phone AS "customerContactPhone",responsible.full_name AS "responsibleEmployeeName",btm.participation_status AS "participationStatus",btm.started_at AS "startedAt",btm.completed_at AS "completedAt",btm.note,btm.evidence_image_reference AS "evidenceImageReference",btm.evidence_captured_at AS "evidenceCapturedAt" FROM business_trip_members btm JOIN business_trips bt ON bt.id=btm.business_trip_id LEFT JOIN customers c ON c.id=bt.customer_id LEFT JOIN employees responsible ON responsible.id=bt.responsible_employee_id WHERE btm.employee_id=$1 ORDER BY bt.start_at DESC`, [user.employeeId]);
  }

  async start(user: AuthenticatedUserView, id: string, input: StartBusinessTripDto): Promise<unknown> {
    const employeeId = user.employeeId;
    if (!employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.dataSource.transaction(async (manager) => {
      const trip = await manager.getRepository(BusinessTripEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      const member = await manager.getRepository(BusinessTripMemberEntity).findOne({ where: { businessTripId: id, employeeId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || !member) throw new NotFoundException({ code: 'BUSINESS_TRIP_ASSIGNMENT_NOT_FOUND', message: 'Không tìm thấy phân công công tác của nhân viên.' });
      if (!canStartBusinessTripMember(trip.status, member.participationStatus)) throw new ConflictException({ code: 'BUSINESS_TRIP_CANNOT_START', message: 'Phân công này chưa thể bắt đầu hoặc đã được bắt đầu.' });
      const now = new Date();
      member.participationStatus = 'IN_PROGRESS'; member.startedAt = now; member.startLatitude = input.latitude; member.startLongitude = input.longitude; member.startAccuracyMeters = input.accuracyMeters ?? null;
      await manager.getRepository(BusinessTripMemberEntity).save(member);
      await manager.getRepository(AttendanceEventEntity).save(manager.getRepository(AttendanceEventEntity).create({ employeeId, eventType: 'CHECK_IN', attendanceType: 'BUSINESS_TRIP', serverTime: now, deviceTime: input.deviceTime ? new Date(input.deviceTime) : null, latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters ?? null, riskFlags: [], businessTripId: id, officeLocationId: null }));
      if (trip.status === 'ASSIGNED') { trip.status = 'IN_PROGRESS'; await manager.getRepository(BusinessTripEntity).save(trip); }
      await this.audit(manager, user.id, id, 'MEMBER_START', { employeeId, status: 'ASSIGNED' }, { employeeId, status: 'IN_PROGRESS', startedAt: now });
      return { businessTripId: id, participationStatus: member.participationStatus, startedAt: member.startedAt };
    });
  }

  async complete(user: AuthenticatedUserView, id: string, input: CompleteBusinessTripDto): Promise<unknown> {
    const employeeId = user.employeeId;
    if (!employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.dataSource.transaction(async (manager) => {
      const trip = await manager.getRepository(BusinessTripEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      const member = await manager.getRepository(BusinessTripMemberEntity).findOne({ where: { businessTripId: id, employeeId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || !member) throw new NotFoundException({ code: 'BUSINESS_TRIP_ASSIGNMENT_NOT_FOUND', message: 'Không tìm thấy phân công công tác của nhân viên.' });
      if (!canCompleteBusinessTripMember(member.participationStatus)) throw new ConflictException({ code: 'BUSINESS_TRIP_CANNOT_COMPLETE', message: 'Phải bắt đầu công tác trước khi hoàn tất.' });
      if (!hasValidBusinessTripEvidence(trip.requiresPhoto, input.evidenceImageReference, input.evidenceCapturedAt)) throw new BadRequestException({ code: trip.requiresPhoto ? 'BUSINESS_TRIP_PHOTO_REQUIRED' : 'INCOMPLETE_BUSINESS_TRIP_EVIDENCE', message: 'Ảnh tham chiếu và thời điểm chụp phải được gửi đầy đủ theo yêu cầu của phiếu.' });
      const now = new Date();
      Object.assign(member, { participationStatus: 'COMPLETED', completedAt: now, endLatitude: input.latitude, endLongitude: input.longitude, endAccuracyMeters: input.accuracyMeters ?? null, note: input.note?.trim() || null, evidenceImageReference: input.evidenceImageReference?.trim() || null, evidenceCapturedAt: input.evidenceCapturedAt ? new Date(input.evidenceCapturedAt) : null });
      await manager.getRepository(BusinessTripMemberEntity).save(member);
      await manager.getRepository(AttendanceEventEntity).save(manager.getRepository(AttendanceEventEntity).create({ employeeId, eventType: 'CHECK_OUT', attendanceType: 'BUSINESS_TRIP', serverTime: now, deviceTime: input.deviceTime ? new Date(input.deviceTime) : null, latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters ?? null, riskFlags: [], businessTripId: id, officeLocationId: null }));
      const statuses = (await manager.query<Array<{ status: string }>>('SELECT participation_status AS status FROM business_trip_members WHERE business_trip_id=$1', [id])).map((row) => row.status);
      if (shouldCompleteBusinessTrip(statuses)) { trip.status = 'COMPLETED'; await manager.getRepository(BusinessTripEntity).save(trip); }
      await this.audit(manager, user.id, id, 'MEMBER_COMPLETE', { employeeId, status: 'IN_PROGRESS' }, { employeeId, status: 'COMPLETED', completedAt: now, hasEvidence: Boolean(member.evidenceImageReference) });
      return { businessTripId: id, participationStatus: member.participationStatus, completedAt: member.completedAt, tripStatus: trip.status };
    });
  }

  history(id: string): Promise<unknown[]> {
    return this.dataSource.query(`SELECT l.id,l.action,l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName" FROM configuration_audit_logs l JOIN users u ON u.id=l.created_by LEFT JOIN employees e ON e.user_id=u.id WHERE l.resource_type='BUSINESS_TRIP' AND l.resource_id=$1 ORDER BY l.created_at DESC`, [id]);
  }

  private validateTime(startAt: Date, endAt: Date): void {
    if (endAt <= startAt) throw new BadRequestException({ code: 'INVALID_TRIP_TIME', message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
  }

  private async assertMembers(manager: EntityManager, memberIds: string[], responsibleEmployeeId: string): Promise<void> {
    if (!memberIds.includes(responsibleEmployeeId)) throw new BadRequestException({ code: 'RESPONSIBLE_EMPLOYEE_MUST_BE_MEMBER', message: 'Người phụ trách phải nằm trong danh sách thành viên.' });
    const [result] = await manager.query<Array<{ count: number }>>('SELECT COUNT(*)::int AS count FROM employees WHERE id=ANY($1::uuid[]) AND is_active=true', [memberIds]);
    if ((result?.count ?? 0) !== memberIds.length) throw new BadRequestException({ code: 'BUSINESS_TRIP_MEMBER_INVALID', message: 'Danh sách có nhân viên không tồn tại hoặc đã khóa.' });
  }

  private async memberIds(manager: EntityManager, id: string): Promise<string[]> {
    return (await manager.query<Array<{ employeeId: string }>>('SELECT employee_id AS "employeeId" FROM business_trip_members WHERE business_trip_id=$1', [id])).map((row) => row.employeeId);
  }

  private audit(manager: EntityManager, userId: string, resourceId: string, action: string, oldValue: unknown, newValue: unknown): Promise<ConfigurationAuditLogEntity> {
    return manager.save(ConfigurationAuditLogEntity, manager.create(ConfigurationAuditLogEntity, { resourceType: 'BUSINESS_TRIP', resourceId, action, oldValue, newValue, createdBy: userId }));
  }
}
