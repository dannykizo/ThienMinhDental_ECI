import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { AttendanceAdjustmentEntity, AttendanceEventEntity, AttendanceExplanationEntity, OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { AttendanceRiskFlag } from './domain/attendance-risk-flag.js';
import { OfficeGeofence } from './domain/office-geofence.js';
import { calculateWorkSummary, evaluateScheduleRisk, localMinutes, type SchedulePolicyInput } from './domain/schedule-policy.js';
import { canReviewExplanation, validateEvidence } from './domain/explanation-policy.js';
import type { CreateAttendanceAdjustmentDto, CreateAttendanceExplanationDto, RecordAttendanceEventDto, RespondAttendanceExplanationDto, ReviewAttendanceExplanationDto } from './attendance.dto.js';

interface ScheduleRow extends SchedulePolicyInput { id: string; }
interface AttendanceDailyRow {
  employeeId: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  status: string;
  [key: string]: unknown;
}
interface TodayAttendanceView {
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  date: string;
  riskFlags: string[];
  status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
  workedMinutes: number;
  overtimeMinutes: number;
  requiredWorkMinutes: number;
  isFullWorkday: boolean;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AttendanceEventEntity) private readonly events: Repository<AttendanceEventEntity>,
    @InjectRepository(AttendanceAdjustmentEntity) private readonly adjustments: Repository<AttendanceAdjustmentEntity>,
    @InjectRepository(AttendanceExplanationEntity) private readonly explanations: Repository<AttendanceExplanationEntity>,
  ) {}

  async record(user: AuthenticatedUserView, input: RecordAttendanceEventDto): Promise<AttendanceEventEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    if (input.latitude === undefined || input.longitude === undefined) throw new BadRequestException({ code: 'LOCATION_REQUIRED', message: 'Vị trí là bắt buộc tại sự kiện chấm công.' });
    if (input.attendanceType === 'BUSINESS_TRIP') throw new BadRequestException({ code: 'USE_BUSINESS_TRIP_WORKFLOW', message: 'Chấm công công tác phải dùng thao tác bắt đầu/kết thúc trên phiếu được giao.' });

    const now = new Date();
    const [dayStart, dayEnd] = this.dayRange(now);
    const todayEvents = await this.events.find({ where: { employeeId: user.employeeId, serverTime: Between(dayStart, dayEnd) }, order: { serverTime: 'ASC' } });
    const last = todayEvents.at(-1);
    if (input.eventType === 'CHECK_IN' && last?.eventType === 'CHECK_IN') throw new ConflictException({ code: 'ALREADY_CHECKED_IN', message: 'Nhân viên đã check-in và chưa check-out.' });
    if (input.eventType === 'CHECK_OUT' && (!last || last.eventType !== 'CHECK_IN')) throw new ConflictException({ code: 'CHECK_IN_REQUIRED', message: 'Phải check-in trước khi check-out.' });

    const risk = await this.evaluateRisk(user.employeeId, input, now);
    return this.events.save(this.events.create({
      employeeId: user.employeeId,
      eventType: input.eventType,
      attendanceType: input.attendanceType,
      serverTime: now,
      deviceTime: input.deviceTime ? new Date(input.deviceTime) : null,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? null,
      riskFlags: risk.flags,
      businessTripId: input.businessTripId ?? null,
      officeLocationId: risk.officeLocationId,
    }));
  }

  async list(date?: string): Promise<unknown[]> {
    const selected = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const rows = await this.dataSource.query<AttendanceDailyRow[]>(`SELECT e.id AS "employeeId", e.employee_code AS "employeeCode", e.full_name AS "fullName", e.employee_type AS "employeeType", MIN(a.server_time) FILTER (WHERE a.event_type='CHECK_IN') AS "checkedInAt", MAX(a.server_time) FILTER (WHERE a.event_type='CHECK_OUT') AS "checkedOutAt", COALESCE(array_remove(array_agg(DISTINCT flag), NULL), '{}') AS "riskFlags", CASE WHEN COUNT(a.id) FILTER (WHERE a.event_type='CHECK_OUT') > 0 THEN 'CHECKED_OUT' WHEN COUNT(a.id) FILTER (WHERE a.event_type='CHECK_IN') > 0 THEN 'CHECKED_IN' ELSE 'NOT_CHECKED_IN' END AS status, (SELECT x.status FROM attendance_explanation_requests x WHERE x.employee_id=e.id AND x.work_date=$1::date ORDER BY x.created_at DESC LIMIT 1) AS "explanationStatus" FROM employees e LEFT JOIN attendance_events a ON a.employee_id=e.id AND (a.server_time AT TIME ZONE 'Asia/Bangkok')::date=$1::date LEFT JOIN LATERAL unnest(a.risk_flags) flag ON true WHERE e.is_active=true GROUP BY e.id ORDER BY e.full_name`, [selected]);
    return Promise.all(rows.map(async (row) => ({
      ...row,
      ...calculateWorkSummary(row.checkedInAt, row.checkedOutAt, await this.resolveSchedule(row.employeeId, selected)),
    })));
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
    const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return {
      checkedInAt,
      checkedOutAt,
      date,
      riskFlags: [...new Set(events.flatMap((event) => event.riskFlags))],
      status,
      ...calculateWorkSummary(checkedInAt, checkedOutAt, await this.resolveSchedule(user.employeeId, date)),
    };
  }

  async createAdjustment(user: AuthenticatedUserView, input: CreateAttendanceAdjustmentDto): Promise<AttendanceAdjustmentEntity> {
    await this.assertPeriodOpen(input.workDate);
    const newValue = this.validateAdjustmentValue(input.fieldName, input.newValue);
    const oldValue = await this.getCurrentValue(input.employeeId, input.workDate, input.fieldName);
    return this.adjustments.save(this.adjustments.create({ ...input, oldValue, newValue, adjustedBy: user.id }));
  }

  listAdjustments(): Promise<unknown[]> {
    return this.dataSource.query(`SELECT a.id,a.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",a.work_date::text AS "workDate",a.field_name AS "fieldName",a.old_value AS "oldValue",a.new_value AS "newValue",a.reason,a.created_at AS "createdAt",COALESCE(actor.full_name,u.email) AS "adjustedByName" FROM attendance_adjustments a JOIN employees e ON e.id=a.employee_id JOIN users u ON u.id=a.adjusted_by LEFT JOIN employees actor ON actor.user_id=u.id ORDER BY a.created_at DESC LIMIT 100`);
  }

  async createExplanation(user: AuthenticatedUserView, input: CreateAttendanceExplanationDto): Promise<AttendanceExplanationEntity> {
    await this.assertPeriodOpen(input.workDate);
    const [employee] = await this.dataSource.query<Array<{ id: string }>>('SELECT id FROM employees WHERE id=$1 AND is_active=true', [input.employeeId]);
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy nhân viên đang hoạt động.' });
    const dueAt = new Date(input.dueAt);
    if (dueAt.getTime() <= Date.now()) throw new BadRequestException({ code: 'INVALID_EXPLANATION_DEADLINE', message: 'Hạn giải trình phải ở tương lai.' });
    if (input.attendanceEventId) {
      const [event] = await this.dataSource.query<Array<{ id: string }>>(`SELECT id FROM attendance_events WHERE id=$1 AND employee_id=$2 AND (server_time AT TIME ZONE 'Asia/Bangkok')::date=$3::date`, [input.attendanceEventId, input.employeeId, input.workDate]);
      if (!event) throw new BadRequestException({ code: 'ATTENDANCE_EVENT_MISMATCH', message: 'Sự kiện chấm công không thuộc nhân viên và ngày đã chọn.' });
    }
    const existing = await this.explanations.findOne({ where: { employeeId: input.employeeId, workDate: input.workDate, issueType: input.issueType, status: In(['REQUESTED', 'SUBMITTED']) } });
    if (existing) throw new ConflictException({ code: 'EXPLANATION_ALREADY_REQUESTED', message: 'Đã có yêu cầu giải trình đang chờ cho vấn đề này.' });
    return this.explanations.save(this.explanations.create({
      ...input,
      attendanceEventId: input.attendanceEventId ?? null,
      dueAt,
      requestedBy: user.id,
      status: 'REQUESTED',
    }));
  }

  listExplanations(date?: string): Promise<unknown[]> {
    return this.dataSource.query(`SELECT x.id,x.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",x.work_date::text AS "workDate",x.attendance_event_id AS "attendanceEventId",x.issue_type AS "issueType",x.request_note AS "requestNote",x.status,x.due_at AS "dueAt",x.response_text AS "responseText",x.evidence_image_reference AS "evidenceImageReference",x.evidence_captured_at AS "evidenceCapturedAt",x.evidence_latitude AS "evidenceLatitude",x.evidence_longitude AS "evidenceLongitude",x.review_note AS "reviewNote",x.reviewed_at AS "reviewedAt",x.created_at AS "createdAt",COALESCE(requester.full_name,ru.email) AS "requestedByName",COALESCE(reviewer.full_name,vu.email) AS "reviewedByName" FROM attendance_explanation_requests x JOIN employees e ON e.id=x.employee_id JOIN users ru ON ru.id=x.requested_by LEFT JOIN employees requester ON requester.user_id=ru.id LEFT JOIN users vu ON vu.id=x.reviewed_by LEFT JOIN employees reviewer ON reviewer.user_id=vu.id WHERE ($1::date IS NULL OR x.work_date=$1::date) ORDER BY CASE x.status WHEN 'SUBMITTED' THEN 1 WHEN 'REQUESTED' THEN 2 ELSE 3 END,x.created_at DESC`, [date ?? null]);
  }

  async listMyExplanations(user: AuthenticatedUserView): Promise<AttendanceExplanationEntity[]> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    return this.explanations.find({ where: { employeeId: user.employeeId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async respondToExplanation(user: AuthenticatedUserView, id: string, input: RespondAttendanceExplanationDto): Promise<AttendanceExplanationEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const item = await this.explanations.findOne({ where: { id } });
    if (!item || item.employeeId !== user.employeeId) throw new NotFoundException({ code: 'EXPLANATION_NOT_FOUND', message: 'Không tìm thấy yêu cầu giải trình.' });
    if (item.status !== 'REQUESTED') throw new ConflictException({ code: 'EXPLANATION_NOT_AWAITING_RESPONSE', message: 'Yêu cầu này không còn chờ phản hồi.' });
    if (item.dueAt.getTime() < Date.now()) throw new ConflictException({ code: 'EXPLANATION_DEADLINE_PASSED', message: 'Yêu cầu giải trình đã quá hạn.' });
    if (!validateEvidence(item.issueType as CreateAttendanceExplanationDto['issueType'], input)) throw new BadRequestException({ code: 'INCOMPLETE_EXPLANATION_EVIDENCE', message: 'Bằng chứng ảnh phải có đủ ảnh tham chiếu, thời điểm chụp và tọa độ.' });
    Object.assign(item, {
      responseText: input.responseText.trim(),
      evidenceImageReference: input.evidenceImageReference?.trim() || null,
      evidenceCapturedAt: input.evidenceCapturedAt ? new Date(input.evidenceCapturedAt) : null,
      evidenceLatitude: input.evidenceLatitude ?? null,
      evidenceLongitude: input.evidenceLongitude ?? null,
      status: 'SUBMITTED',
    });
    return this.explanations.save(item);
  }

  async reviewExplanation(user: AuthenticatedUserView, id: string, input: ReviewAttendanceExplanationDto): Promise<AttendanceExplanationEntity> {
    const item = await this.explanations.findOne({ where: { id } });
    if (!item) throw new NotFoundException({ code: 'EXPLANATION_NOT_FOUND', message: 'Không tìm thấy yêu cầu giải trình.' });
    if (!canReviewExplanation(item.status)) throw new ConflictException({ code: 'EXPLANATION_NOT_REVIEWABLE', message: 'Chỉ giải trình đã gửi mới được duyệt.' });
    if (input.status === 'REJECTED' && !input.reviewNote?.trim()) throw new BadRequestException({ code: 'REJECTION_NOTE_REQUIRED', message: 'Lý do từ chối là bắt buộc.' });
    item.status = input.status;
    item.reviewNote = input.reviewNote?.trim() || null;
    item.reviewedBy = user.id;
    item.reviewedAt = new Date();
    return this.explanations.save(item);
  }

  private async evaluateRisk(employeeId: string, input: RecordAttendanceEventDto, now: Date): Promise<{ flags: string[]; officeLocationId: string | null }> {
    const flags: string[] = [];
    let officeLocationId: string | null = null;
    if (input.mockLocationSignal) flags.push(AttendanceRiskFlag.MockLocationSignal);
    if (input.attendanceType === 'OFFICE') {
      const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      const locations = await this.dataSource.query<OfficeLocationEntity[]>(
        `SELECT id, name, address, latitude, longitude, radius_meters AS "radiusMeters",
          accuracy_threshold_meters AS "accuracyThresholdMeters", branch_id AS "branchId",
          location_type AS "locationType", is_active AS "isActive"
         FROM office_locations l
         WHERE l.is_active=true AND (l.branch_id IS NULL OR l.branch_id IN (
           SELECT a.branch_id FROM employee_organization_assignments a
           WHERE a.employee_id=$1 AND a.effective_from <= $2::date
             AND (a.effective_to IS NULL OR a.effective_to >= $2::date)
         ))`,
        [employeeId, date],
      );
      const point = { latitude: input.latitude!, longitude: input.longitude! };
      const location = locations
        .map((candidate) => ({ candidate, geofence: new OfficeGeofence({ latitude: candidate.latitude, longitude: candidate.longitude }, candidate.radiusMeters) }))
        .sort((a, b) => a.geofence.distanceFromCenter(point) - b.geofence.distanceFromCenter(point))[0];
      if (!location) throw new NotFoundException({ code: 'OFFICE_LOCATION_NOT_CONFIGURED', message: 'Chưa cấu hình vị trí làm việc cho chi nhánh của nhân viên.' });
      officeLocationId = location.candidate.id;
      if (!location.geofence.contains(point)) flags.push(AttendanceRiskFlag.OutsideGeofence);
      if (input.accuracyMeters !== undefined && input.accuracyMeters > location.candidate.accuracyThresholdMeters) flags.push(AttendanceRiskFlag.LowAccuracy);
    }
    const schedule = await this.resolveSchedule(employeeId, now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
    if (schedule) flags.push(...evaluateScheduleRisk(input.eventType, localMinutes(now), schedule));
    return { flags, officeLocationId };
  }

  private async resolveSchedule(employeeId: string, date: string): Promise<ScheduleRow | null> {
    const [schedule] = await this.dataSource.query<ScheduleRow[]>(
      `WITH org AS (
         SELECT branch_id, department_id FROM employee_organization_assignments
         WHERE employee_id=$1 AND effective_from <= $2::date
           AND (effective_to IS NULL OR effective_to >= $2::date)
         ORDER BY is_primary DESC, effective_from DESC LIMIT 1
       ), candidates AS (
         SELECT es.schedule_id, es.effective_from, 1 AS priority
         FROM employee_schedules es
         WHERE es.employee_id=$1 AND es.effective_from <= $2::date
           AND (es.effective_to IS NULL OR es.effective_to >= $2::date)
         UNION ALL
         SELECT ds.schedule_id, ds.effective_from, 2 AS priority
         FROM department_schedules ds JOIN org o ON o.branch_id=ds.branch_id AND o.department_id=ds.department_id
         WHERE ds.effective_from <= $2::date AND (ds.effective_to IS NULL OR ds.effective_to >= $2::date)
       )
       SELECT ws.id, ws.start_time AS "startTime", ws.end_time AS "endTime",
         ws.late_tolerance_minutes AS "lateToleranceMinutes",
         ws.early_leave_tolerance_minutes AS "earlyLeaveToleranceMinutes",
         ws.required_work_minutes AS "requiredWorkMinutes"
       FROM candidates c JOIN work_schedules ws ON ws.id=c.schedule_id
       WHERE ws.is_active=true AND extract(isodow from $2::date)::int=ANY(ws.weekdays)
       ORDER BY c.priority, c.effective_from DESC LIMIT 1`,
      [employeeId, date],
    );
    return schedule ?? null;
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
      const rows = await this.list(workDate) as AttendanceDailyRow[];
      return rows.find((row) => row.employeeId === employeeId)?.status ?? null;
    }
    const eventType = fieldName === 'CHECK_IN_TIME' ? 'CHECK_IN' : 'CHECK_OUT';
    const [event] = await this.dataSource.query<Array<{ value: string }>>(
      `SELECT server_time::text AS value FROM attendance_events WHERE employee_id=$1 AND event_type=$2 AND (server_time AT TIME ZONE 'Asia/Bangkok')::date=$3::date ORDER BY server_time ${eventType === 'CHECK_IN' ? 'ASC' : 'DESC'} LIMIT 1`,
      [employeeId, eventType, workDate],
    );
    return event?.value ?? null;
  }

  private async assertPeriodOpen(workDate: string): Promise<void> {
    const [period] = await this.dataSource.query<Array<{ status: string }>>(`SELECT status FROM attendance_periods WHERE period_month=date_trunc('month',$1::date)::date`, [workDate]);
    if (period?.status === 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: 'Kỳ công đã chốt. Kế toán trưởng phải mở lại kỳ trước khi điều chỉnh.' });
  }
}
