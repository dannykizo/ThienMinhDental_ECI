import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { AttendanceAdjustmentEntity, AttendanceEventEntity, BusinessTripMemberEntity, OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { AttendanceRiskFlag } from './domain/attendance-risk-flag.js';
import { OfficeGeofence } from './domain/office-geofence.js';
import type { CreateAttendanceAdjustmentDto, RecordAttendanceEventDto } from './attendance.dto.js';

interface ScheduleRow { start_time: string; end_time: string; late_tolerance_minutes: number; }
interface AttendanceDailyRow { employeeId: string; status: string; }
interface TodayAttendanceView {
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  date: string;
  riskFlags: string[];
  status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AttendanceEventEntity) private readonly events: Repository<AttendanceEventEntity>,
    @InjectRepository(AttendanceAdjustmentEntity) private readonly adjustments: Repository<AttendanceAdjustmentEntity>,
    @InjectRepository(OfficeLocationEntity) private readonly locations: Repository<OfficeLocationEntity>,
    @InjectRepository(BusinessTripMemberEntity) private readonly tripMembers: Repository<BusinessTripMemberEntity>,
  ) {}

  async record(user: AuthenticatedUserView, input: RecordAttendanceEventDto): Promise<AttendanceEventEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    if (input.latitude === undefined || input.longitude === undefined) throw new BadRequestException({ code: 'LOCATION_REQUIRED', message: 'Vị trí là bắt buộc tại sự kiện chấm công.' });
    if (input.attendanceType === 'BUSINESS_TRIP') {
      if (!input.businessTripId) throw new BadRequestException({ code: 'BUSINESS_TRIP_REQUIRED', message: 'Phiếu công tác là bắt buộc.' });
      const member = await this.tripMembers.findOne({ where: { businessTripId: input.businessTripId, employeeId: user.employeeId } });
      if (!member) throw new BadRequestException({ code: 'BUSINESS_TRIP_NOT_ASSIGNED', message: 'Nhân viên không thuộc phiếu công tác này.' });
    }

    const now = new Date();
    const [dayStart, dayEnd] = this.dayRange(now);
    const todayEvents = await this.events.find({ where: { employeeId: user.employeeId, serverTime: Between(dayStart, dayEnd) }, order: { serverTime: 'ASC' } });
    const last = todayEvents.at(-1);
    if (input.eventType === 'CHECK_IN' && last?.eventType === 'CHECK_IN') throw new ConflictException({ code: 'ALREADY_CHECKED_IN', message: 'Nhân viên đã check-in và chưa check-out.' });
    if (input.eventType === 'CHECK_OUT' && (!last || last.eventType !== 'CHECK_IN')) throw new ConflictException({ code: 'CHECK_IN_REQUIRED', message: 'Phải check-in trước khi check-out.' });

    const riskFlags = await this.evaluateRisk(user.employeeId, input, now);
    return this.events.save(this.events.create({
      employeeId: user.employeeId,
      eventType: input.eventType,
      attendanceType: input.attendanceType,
      serverTime: now,
      deviceTime: input.deviceTime ? new Date(input.deviceTime) : null,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? null,
      riskFlags,
      businessTripId: input.businessTripId ?? null,
    }));
  }

  async list(date?: string): Promise<AttendanceDailyRow[]> {
    const selected = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return this.dataSource.query<AttendanceDailyRow[]>(`SELECT e.id AS "employeeId", e.employee_code AS "employeeCode", e.full_name AS "fullName", e.employee_type AS "employeeType", MIN(a.server_time) FILTER (WHERE a.event_type='CHECK_IN') AS "checkedInAt", MAX(a.server_time) FILTER (WHERE a.event_type='CHECK_OUT') AS "checkedOutAt", COALESCE(array_remove(array_agg(DISTINCT flag), NULL), '{}') AS "riskFlags", CASE WHEN COUNT(a.id) FILTER (WHERE a.event_type='CHECK_OUT') > 0 THEN 'CHECKED_OUT' WHEN COUNT(a.id) FILTER (WHERE a.event_type='CHECK_IN') > 0 THEN 'CHECKED_IN' ELSE 'NOT_CHECKED_IN' END AS status FROM employees e LEFT JOIN attendance_events a ON a.employee_id=e.id AND (a.server_time AT TIME ZONE 'Asia/Bangkok')::date=$1::date LEFT JOIN LATERAL unnest(a.risk_flags) flag ON true WHERE e.is_active=true GROUP BY e.id ORDER BY e.full_name`, [selected]);
  }

  async getToday(user: AuthenticatedUserView): Promise<TodayAttendanceView> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const now = new Date();
    const [dayStart, dayEnd] = this.dayRange(now);
    const events = await this.events.find({
      where: { employeeId: user.employeeId, serverTime: Between(dayStart, dayEnd) },
      order: { serverTime: 'ASC' },
    });
    const checkedInAt = events.find((event) => event.eventType === 'CHECK_IN')?.serverTime ?? null;
    const checkedOutAt = events.findLast((event) => event.eventType === 'CHECK_OUT')?.serverTime ?? null;
    const status = checkedOutAt ? 'CHECKED_OUT' : checkedInAt ? 'CHECKED_IN' : 'NOT_CHECKED_IN';
    return {
      checkedInAt,
      checkedOutAt,
      date: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
      riskFlags: [...new Set(events.flatMap((event) => event.riskFlags))],
      status,
    };
  }

  async createAdjustment(user: AuthenticatedUserView, input: CreateAttendanceAdjustmentDto): Promise<AttendanceAdjustmentEntity> {
    const newValue = this.validateAdjustmentValue(input.fieldName, input.newValue);
    const oldValue = await this.getCurrentValue(input.employeeId, input.workDate, input.fieldName);
    return this.adjustments.save(this.adjustments.create({ ...input, oldValue, newValue, adjustedBy: user.id }));
  }

  listAdjustments(): Promise<AttendanceAdjustmentEntity[]> { return this.adjustments.find({ order: { createdAt: 'DESC' }, take: 100 }); }

  private async evaluateRisk(employeeId: string, input: RecordAttendanceEventDto, now: Date): Promise<string[]> {
    const flags: string[] = [];
    if (input.mockLocationSignal) flags.push(AttendanceRiskFlag.MockLocationSignal);
    if (input.attendanceType === 'OFFICE') {
      const location = await this.locations.findOne({ where: { isActive: true }, order: { name: 'ASC' } });
      if (!location) throw new NotFoundException({ code: 'OFFICE_LOCATION_NOT_CONFIGURED', message: 'Chưa cấu hình vị trí văn phòng.' });
      const geofence = new OfficeGeofence({ latitude: location.latitude, longitude: location.longitude }, location.radiusMeters);
      if (!geofence.contains({ latitude: input.latitude!, longitude: input.longitude! })) flags.push(AttendanceRiskFlag.OutsideGeofence);
      if (input.accuracyMeters !== undefined && input.accuracyMeters > location.accuracyThresholdMeters) flags.push(AttendanceRiskFlag.LowAccuracy);
    }
    const rows = await this.dataSource.query<ScheduleRow[]>(`SELECT ws.start_time, ws.end_time, ws.late_tolerance_minutes FROM employee_schedules es JOIN work_schedules ws ON ws.id=es.schedule_id WHERE es.employee_id=$1 AND es.effective_from <= $2::date AND (es.effective_to IS NULL OR es.effective_to >= $2::date) AND ws.is_active=true LIMIT 1`, [employeeId, now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })]);
    const schedule = rows[0];
    if (schedule) {
      const localMinutes = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':')[0]) * 60 + Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':')[1]);
      const [startHour, startMinute] = schedule.start_time.split(':').map(Number);
      const [endHour, endMinute] = schedule.end_time.split(':').map(Number);
      if (input.eventType === 'CHECK_IN' && localMinutes > startHour * 60 + startMinute + schedule.late_tolerance_minutes) flags.push(AttendanceRiskFlag.Late);
      if (input.eventType === 'CHECK_OUT' && localMinutes < endHour * 60 + endMinute) flags.push(AttendanceRiskFlag.EarlyLeave);
    }
    return flags;
  }

  private dayRange(date: Date): [Date, Date] {
    const day = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return [new Date(`${day}T00:00:00+07:00`), new Date(`${day}T23:59:59.999+07:00`)];
  }

  private validateAdjustmentValue(fieldName: string, value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException({ code: 'INVALID_ADJUSTMENT_VALUE', message: 'Giá trị điều chỉnh không hợp lệ.' });
    }
    if (fieldName === 'DAY_STATUS') {
      const allowed = ['PRESENT', 'LEAVE', 'BUSINESS_TRIP', 'ABSENT', 'INCOMPLETE'];
      if (!allowed.includes(value)) throw new BadRequestException({ code: 'INVALID_DAY_STATUS', message: 'Trạng thái ngày công không hợp lệ.' });
      return value;
    }
    if (Number.isNaN(Date.parse(value))) throw new BadRequestException({ code: 'INVALID_ATTENDANCE_TIME', message: 'Thời gian điều chỉnh phải theo chuẩn ISO.' });
    return new Date(value).toISOString();
  }

  private async getCurrentValue(employeeId: string, workDate: string, fieldName: string): Promise<string | null> {
    const [latest] = await this.dataSource.query<Array<{ value: string }>>(
      `SELECT new_value#>>'{}' AS value FROM attendance_adjustments WHERE employee_id=$1 AND work_date=$2::date AND field_name=$3 ORDER BY created_at DESC LIMIT 1`,
      [employeeId, workDate, fieldName],
    );
    if (latest) return latest.value;
    if (fieldName === 'DAY_STATUS') {
      const rows = await this.list(workDate);
      return rows.find((row) => row.employeeId === employeeId)?.status ?? null;
    }
    const eventType = fieldName === 'CHECK_IN_TIME' ? 'CHECK_IN' : 'CHECK_OUT';
    const [event] = await this.dataSource.query<Array<{ value: string }>>(
      `SELECT server_time::text AS value FROM attendance_events WHERE employee_id=$1 AND event_type=$2 AND (server_time AT TIME ZONE 'Asia/Bangkok')::date=$3::date ORDER BY server_time ${eventType === 'CHECK_IN' ? 'ASC' : 'DESC'} LIMIT 1`,
      [employeeId, eventType, workDate],
    );
    return event?.value ?? null;
  }
}
