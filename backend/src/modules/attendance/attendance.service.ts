import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import { AttendanceAdjustmentEntity, AttendanceEventEntity, AttendanceExplanationEntity, OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { AttendanceRiskFlag } from './domain/attendance-risk-flag.js';
import { OfficeGeofence } from './domain/office-geofence.js';
import { calculateWorkSummary, evaluateScheduleRisk, localMinutes, type SchedulePolicyInput } from './domain/schedule-policy.js';
import { validExplanationDate, validateEvidence } from './domain/explanation-policy.js';
import type { CreateAttendanceAdjustmentDto, CreateAttendanceExplanationDto, PrepareCheckInDto, RecordAttendanceEventDto, RespondAttendanceExplanationDto, ReviewAttendanceExplanationDto, SubmitEmployeeExplanationDto } from './attendance.dto.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { dailyAttendanceError, vietnamWorkDate } from './domain/daily-attendance-policy.js';
import { AttendanceEvidenceStorage } from './infrastructure/attendance-evidence.storage.js';
import { ExplanationWorkflowService } from './application/explanation-workflow.service.js';
import { AttendanceDeviceProof } from './infrastructure/attendance-device-proof.js';

interface ScheduleRow extends SchedulePolicyInput { id: string; }
interface AttendanceDailyRow {
  employeeId: string;
  approvedOvertimeMinutes: number;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  status: string;
  [key: string]: unknown;
}
interface TodayAttendanceView {
  attendanceType: string | null;
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

interface OfficeGeofenceResult {
  accuracyThresholdMeters: number;
  address: string;
  distanceMeters: number;
  id: string;
  name: string;
  radiusMeters: number;
}

interface AttendanceRiskResult {
  flags: string[];
  officeLocation: OfficeGeofenceResult | null;
}

interface RecordedAttendanceEventView {
  accuracyMeters: number | null;
  accuracyThresholdMeters: number | null;
  allowedRadiusMeters: number | null;
  attendanceType: string;
  distanceMeters: number | null;
  eventType: string;
  id: string;
  officeLocationAddress: string | null;
  officeLocationId: string | null;
  officeLocationName: string | null;
  riskFlags: string[];
  serverTime: Date;
}

interface CheckInCapture {
  id: string; employee_id: string; user_id: string; attendance_type: string;
  field_work_content: string | null; latitude: number; longitude: number;
  accuracy_meters: number; mock_location_signal: boolean; prepared_at: Date; expires_at: Date;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AttendanceEventEntity) private readonly events: Repository<AttendanceEventEntity>,
    @InjectRepository(AttendanceAdjustmentEntity) private readonly adjustments: Repository<AttendanceAdjustmentEntity>,
    @InjectRepository(AttendanceExplanationEntity) private readonly explanations: Repository<AttendanceExplanationEntity>,
    private readonly evidenceStorage: AttendanceEvidenceStorage,
    private readonly workflow: ExplanationWorkflowService,
    private readonly deviceProof: AttendanceDeviceProof,
  ) {}

  async prepareCheckIn(user: AuthenticatedUserView, input: PrepareCheckInDto, sid: string): Promise<unknown> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    if (input.attendanceType === 'BUSINESS_TRIP' && (input.fieldWorkContent?.trim().length ?? 0) < 5) throw new BadRequestException({ code: 'FIELD_WORK_CONTENT_REQUIRED', message: 'Nhập nội dung công tác hiện trường ít nhất 5 ký tự.' });
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`attendance-event:${user.employeeId}`]);
      await this.deviceProof.session(manager, user, sid);
      const [active] = await manager.query<Array<{ id: string }>>(`SELECT e.id FROM employees e JOIN users u ON u.id=e.user_id WHERE e.id=$1 AND u.id=$2 AND e.is_active AND u.is_active FOR SHARE OF e,u`, [user.employeeId,user.id]);
      if (!active) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Hồ sơ không còn hoạt động.' });
      const now = new Date(), [start,end] = this.dayRange(now);
      const events = await manager.getRepository(AttendanceEventEntity).find({ where: { employeeId: user.employeeId!, serverTime: Between(start,end) } });
      this.assertDaily(events, 'CHECK_IN', input.attendanceType);
      const risk = await this.evaluateRisk(user.employeeId!, { ...input, eventType: 'CHECK_IN' }, now, manager);
      this.assertSafeLocation(risk, 'CHECK_IN');
      // Avoid unbounded abandoned capture records; only one unconsumed context per employee.
      await manager.query(`DELETE FROM attendance_checkin_captures c WHERE employee_id=$1 AND NOT EXISTS(SELECT 1 FROM attendance_events a WHERE a.checkin_capture_id=c.id)`, [user.employeeId]);
      const [capture] = await manager.query<CheckInCapture[]>(`INSERT INTO attendance_checkin_captures(employee_id,user_id,attendance_type,field_work_content,latitude,longitude,accuracy_meters,mock_location_signal,prepared_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9::timestamptz+interval '10 minutes') RETURNING *`, [user.employeeId,user.id,input.attendanceType,input.attendanceType === 'BUSINESS_TRIP' ? input.fieldWorkContent!.trim() : null,input.latitude,input.longitude,input.accuracyMeters,input.mockLocationSignal,now]);
      return { id: capture.id, serverTime: capture.prepared_at, expiresAt: capture.expires_at, attendanceType: capture.attendance_type, latitude: capture.latitude, longitude: capture.longitude };
    });
  }

  async dailyDetails(user: AuthenticatedUserView, employeeId: string, date: string): Promise<unknown[]> {
    // Defense in depth: checkout GPS never goes through general/scoped list APIs.
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Chỉ Admin được xem vị trí chi tiết.' });
    if (!validExplanationDate(date)) throw new BadRequestException({ code: 'INVALID_ATTENDANCE_DATE', message: 'Chọn ngày hợp lệ YYYY-MM-DD.' });
    return this.dataSource.query(`SELECT id,event_type AS "eventType",attendance_type AS "attendanceType",server_time AS "serverTime",latitude,longitude,accuracy_meters AS "accuracyMeters",field_work_content AS "fieldWorkContent",evidence_image_reference AS "evidenceImageReference",risk_flags AS "riskFlags" FROM attendance_events WHERE employee_id=$1 AND (server_time AT TIME ZONE 'Asia/Bangkok')::date=$2::date ORDER BY server_time`, [employeeId,date]);
  }

  private assertDaily(events: AttendanceEventEntity[], eventType: string, attendanceType: string): void {
    const code = dailyAttendanceError(events,eventType,attendanceType);
    const messages: Record<string,string> = { DAILY_CHECK_IN_LIMIT: 'Bạn đã check-in hôm nay. Ngày mới bắt đầu lúc 00:00.', DAILY_CHECK_OUT_LIMIT: 'Bạn đã check-out hôm nay.', CHECK_IN_REQUIRED: 'Phải check-in trong ngày trước khi check-out.', ATTENDANCE_TYPE_MISMATCH: 'Check-out phải cùng hình thức với check-in hôm nay.' };
    if (code) throw new ConflictException({ code, message: messages[code] });
  }

  async record(user: AuthenticatedUserView, input: RecordAttendanceEventDto, sid: string): Promise<RecordedAttendanceEventView> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) throw new BadRequestException({ code: 'LOCATION_REQUIRED', message: 'Tọa độ hợp lệ là bắt buộc tại sự kiện chấm công.' });
    if (input.businessTripId) throw new BadRequestException({ code: 'DAILY_ATTENDANCE_NO_TICKET', message: 'Chấm công hằng ngày không gắn với vòng đời phiếu công tác.' });

    const employeeId = user.employeeId;
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      await this.assertPeriodOpen(vietnamWorkDate(now), manager);
      // All office and trip writers share this lock. Check and save must be atomic.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`attendance-event:${employeeId}`]);
      await this.deviceProof.session(manager, user, sid);
      const repository = manager.getRepository(AttendanceEventEntity);
      const [dayStart, dayEnd] = this.dayRange(now);
      const todayEvents = await repository.find({ where: { employeeId, serverTime: Between(dayStart, dayEnd) }, order: { serverTime: 'ASC' } });
      this.assertDaily(todayEvents,input.eventType,input.attendanceType);
      const [active] = await manager.query<Array<{ id: string }>>(`SELECT e.id FROM employees e JOIN users u ON u.id=e.user_id WHERE e.id=$1 AND u.id=$2 AND e.is_active AND u.is_active FOR SHARE OF e,u`, [employeeId,user.id]);
      if (!active) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Hồ sơ không còn hoạt động.' });
      let capture: CheckInCapture | undefined;
      let evidenceReference: string | null = null;
      if (input.eventType === 'CHECK_IN') {
        if (!input.checkinCaptureId) throw new BadRequestException({ code: 'CHECK_IN_PHOTO_REQUIRED', message: 'Chụp ảnh trực tiếp trước khi check-in.' });
        [capture] = await manager.query<CheckInCapture[]>('SELECT * FROM attendance_checkin_captures WHERE id=$1 AND employee_id=$2 AND user_id=$3 FOR UPDATE', [input.checkinCaptureId,employeeId,user.id]);
        if (!capture || capture.expires_at <= now || vietnamWorkDate(capture.prepared_at) !== vietnamWorkDate(now)) throw new ConflictException({ code: 'CHECK_IN_CAPTURE_EXPIRED', message: 'Lượt chụp đã hết hạn hoặc sang ngày mới. Chụp lại để check-in.' });
        if (capture.attendance_type !== input.attendanceType || capture.latitude !== input.latitude || capture.longitude !== input.longitude) throw new BadRequestException({ code: 'CHECK_IN_CAPTURE_MISMATCH', message: 'Ảnh/vị trí không khớp lượt check-in.' });
        const [upload] = await manager.query<Array<{ filename: string }>>('SELECT filename FROM attendance_evidence_uploads WHERE evidence_id=$1 AND uploaded_by=$2 FOR UPDATE', [capture.id,user.id]);
        if (!upload) throw new BadRequestException({ code: 'CHECK_IN_PHOTO_REQUIRED', message: 'Ảnh chưa được tải lên. Chụp và gửi ảnh trước khi check-in.' });
        evidenceReference = `/api/attendance/evidence/${upload.filename}`;
        await this.evidenceStorage.assertOwnedReference(user,evidenceReference,manager);
      } else if (input.checkinCaptureId) throw new BadRequestException({ code: 'CHECK_OUT_PHOTO_NOT_REQUIRED', message: 'Check-out không gửi ảnh.' });

      await this.deviceProof.consume(manager, user, sid, input);

      // Use the bound check-in sample, not later caller-supplied accuracy/mock flags.
      const eventInput = capture ? { ...input, accuracyMeters: capture.accuracy_meters, mockLocationSignal: capture.mock_location_signal } : input;

      const risk = await this.evaluateRisk(employeeId, eventInput, now, manager);
      this.assertSafeLocation(risk, input.eventType);
      const event = await repository.save(repository.create({
        employeeId,
        eventType: input.eventType,
        attendanceType: input.attendanceType,
        serverTime: now,
        deviceTime: input.deviceTime ? new Date(input.deviceTime) : null,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: eventInput.accuracyMeters ?? null,
        riskFlags: risk.flags,
        businessTripId: input.businessTripId ?? null,
        officeLocationId: risk.officeLocation?.id ?? null,
        checkinCaptureId: capture?.id ?? null,
        evidenceImageReference: evidenceReference,
        fieldWorkContent: capture?.field_work_content ?? todayEvents.find(item => item.eventType === 'CHECK_IN')?.fieldWorkContent ?? null,
        dailyPolicy: true,
      }));
      const exposeLocation = input.eventType === 'CHECK_IN';
      return {
        accuracyMeters: exposeLocation ? event.accuracyMeters ?? null : null,
        accuracyThresholdMeters: exposeLocation ? risk.officeLocation?.accuracyThresholdMeters ?? null : null,
        allowedRadiusMeters: exposeLocation ? risk.officeLocation?.radiusMeters ?? null : null,
        attendanceType: event.attendanceType,
        distanceMeters: exposeLocation ? risk.officeLocation?.distanceMeters ?? null : null,
        eventType: event.eventType,
        id: event.id,
        officeLocationAddress: exposeLocation ? risk.officeLocation?.address ?? null : null,
        officeLocationId: exposeLocation ? event.officeLocationId ?? null : null,
        officeLocationName: exposeLocation ? risk.officeLocation?.name ?? null : null,
        riskFlags: exposeLocation ? event.riskFlags : event.riskFlags.filter(flag => flag === 'EARLY_LEAVE'),
        serverTime: event.serverTime,
      };
    });
  }

  async list(date?: string): Promise<unknown[]> {
    const selected = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const rows = await this.dataSource.query<AttendanceDailyRow[]>(`SELECT e.id AS "employeeId", e.employee_code AS "employeeCode", e.full_name AS "fullName", e.employee_type AS "employeeType", MIN(a.server_time) FILTER (WHERE a.event_type='CHECK_IN') AS "checkedInAt", MAX(a.server_time) FILTER (WHERE a.event_type='CHECK_OUT') AS "checkedOutAt", (array_agg(a.attendance_type ORDER BY a.server_time) FILTER (WHERE a.event_type='CHECK_IN'))[1] AS "attendanceType", COALESCE((SELECT SUM(ot.requested_minutes)::int FROM overtime_requests ot WHERE ot.employee_id=e.id AND ot.work_date=$1::date AND ot.status='APPROVED'),0) AS "approvedOvertimeMinutes", COALESCE(array_remove(array_agg(DISTINCT flag), NULL), '{}') AS "riskFlags", CASE WHEN COUNT(a.id) FILTER (WHERE a.event_type='CHECK_OUT') > 0 THEN 'CHECKED_OUT' WHEN COUNT(a.id) FILTER (WHERE a.event_type='CHECK_IN') > 0 THEN 'CHECKED_IN' ELSE 'NOT_CHECKED_IN' END AS status, (SELECT x.status FROM attendance_explanation_requests x WHERE x.employee_id=e.id AND x.work_date=$1::date ORDER BY x.created_at DESC LIMIT 1) AS "explanationStatus" FROM employees e LEFT JOIN attendance_events a ON a.employee_id=e.id AND (a.server_time AT TIME ZONE 'Asia/Bangkok')::date=$1::date LEFT JOIN LATERAL unnest(a.risk_flags) flag ON true WHERE e.is_active=true GROUP BY e.id ORDER BY e.full_name`, [selected]);
    return Promise.all(rows.map(async (row) => ({
      ...row,
      ...calculateWorkSummary(row.checkedInAt, row.checkedOutAt, await this.resolveSchedule(row.employeeId, selected)),
      overtimeMinutes: row.approvedOvertimeMinutes,
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
    const [overtime] = await this.dataSource.query<Array<{minutes:number}>>("SELECT COALESCE(SUM(requested_minutes)::int,0) AS minutes FROM overtime_requests WHERE employee_id=$1 AND work_date=$2::date AND status='APPROVED'", [user.employeeId,date]);
    return {
      attendanceType: events.find(event => event.eventType === 'CHECK_IN')?.attendanceType ?? null,
      checkedInAt,
      checkedOutAt,
      date,
      riskFlags: [...new Set(events.flatMap(event => event.eventType === 'CHECK_IN' ? event.riskFlags : event.riskFlags.filter(flag => flag === 'EARLY_LEAVE')))],
      status,
      ...calculateWorkSummary(checkedInAt, checkedOutAt, await this.resolveSchedule(user.employeeId, date)),
      overtimeMinutes: overtime.minutes,
    };
  }

  async createAdjustment(user: AuthenticatedUserView, input: CreateAttendanceAdjustmentDto): Promise<AttendanceAdjustmentEntity> {
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'ATTENDANCE_ADMIN_REQUIRED', message: 'Chỉ Admin được điều chỉnh công.' });
    const reason = input.reason.trim();
    if (reason.length < 5) throw new BadRequestException({ code: 'ADJUSTMENT_REASON_REQUIRED', message: 'Lý do điều chỉnh cần ít nhất 5 ký tự.' });
    if (!validExplanationDate(input.workDate)) throw new BadRequestException({ code: 'INVALID_ADJUSTMENT_DATE', message: 'Ngày điều chỉnh phải là ngày YYYY-MM-DD hợp lệ.' });
    const newValue = this.validateAdjustmentValue(input.fieldName, input.newValue);
    return this.dataSource.transaction(async (manager) => {
      // Share the period lock with closing/reopening and explanation decisions.
      // It also serializes adjustments so oldValue includes the previous committed write.
      await this.assertPeriodOpen(input.workDate, manager);
      const oldValue = await this.getCurrentValue(input.employeeId, input.workDate, input.fieldName, manager);
      const [saved] = await manager.query<AttendanceAdjustmentEntity[]>(`INSERT INTO attendance_adjustments(employee_id,work_date,field_name,old_value,new_value,reason,adjusted_by,created_at)
        VALUES($1,$2::date,$3,$4::jsonb,$5::jsonb,$6,$7,clock_timestamp())
        RETURNING id,employee_id AS "employeeId",work_date::text AS "workDate",field_name AS "fieldName",old_value AS "oldValue",new_value AS "newValue",reason,adjusted_by AS "adjustedBy",created_at AS "createdAt"`,
      [input.employeeId,input.workDate,input.fieldName,JSON.stringify(oldValue),JSON.stringify(newValue),reason,user.id]);
      return saved;
    });
  }

  listAdjustments(): Promise<unknown[]> {
    return this.dataSource.query(`SELECT a.id,a.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",a.work_date::text AS "workDate",a.field_name AS "fieldName",a.old_value AS "oldValue",a.new_value AS "newValue",a.reason,a.created_at AS "createdAt",COALESCE(actor.full_name,u.email) AS "adjustedByName" FROM attendance_adjustments a JOIN employees e ON e.id=a.employee_id JOIN users u ON u.id=a.adjusted_by LEFT JOIN employees actor ON actor.user_id=u.id ORDER BY a.created_at DESC LIMIT 100`);
  }

  createExplanation(_user: AuthenticatedUserView, _input: CreateAttendanceExplanationDto): Promise<never> {
    void _user; void _input;
    return Promise.reject(new ConflictException({ code: 'EMPLOYEE_EXPLANATION_REQUIRED', message: 'Nhân viên chủ động gửi giải trình. Admin quản trị tuyến; Leader xác nhận và Trưởng phòng duyệt.' }));
  }

  async submitEmployeeExplanation(user: AuthenticatedUserView, input: SubmitEmployeeExplanationDto): Promise<AttendanceExplanationEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    const employeeId = user.employeeId;
    if (!validExplanationDate(input.workDate)) throw new BadRequestException({ code: 'INVALID_EXPLANATION_DATE', message: 'Ngày xảy ra vấn đề phải có định dạng YYYY-MM-DD hợp lệ.' });
    if (input.responseText.trim().length < 5) throw new BadRequestException({ code: 'EXPLANATION_CONTENT_REQUIRED', message: 'Nội dung giải trình cần ít nhất 5 ký tự.' });
    if (!validateEvidence(input.issueType, input)) throw new BadRequestException({ code: 'INCOMPLETE_EXPLANATION_EVIDENCE', message: 'Minh chứng phải có ảnh tham chiếu; tọa độ nếu gửi phải có đủ hai giá trị.' });
    const pushes: Parameters<ExplanationWorkflowService['deliver']>[0] = [];
    const saved = await this.dataSource.transaction(async (manager) => {
      // Serialize retries without treating a different submission as success.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`explanation:${user.id}:${input.submissionId}`]);
      const repository = manager.getRepository(AttendanceExplanationEntity);
      const retried = await repository.findOne({ where: { submittedBy: user.id, submissionId: input.submissionId } });
      if (retried) {
        if (retried.workDate !== input.workDate || retried.issueType !== input.issueType || retried.responseText !== input.responseText.trim() || retried.evidenceImageReference !== (input.evidenceImageReference?.trim() || null)
          || (retried.evidenceCapturedAt?.getTime() ?? null) !== (input.evidenceCapturedAt ? new Date(input.evidenceCapturedAt).getTime() : null)
          || (retried.evidenceLatitude == null ? null : Number(retried.evidenceLatitude)) !== (input.evidenceLatitude ?? null)
          || (retried.evidenceLongitude == null ? null : Number(retried.evidenceLongitude)) !== (input.evidenceLongitude ?? null)) throw new ConflictException({ code: 'EXPLANATION_SUBMISSION_MISMATCH', message: 'Mã gửi này đã được dùng cho nội dung khác. Hãy tạo đơn mới.' });
        return retried;
      }
      const [employee] = await manager.query<Array<{ id: string }>>('SELECT id FROM employees WHERE id=$1 AND user_id=$2 AND is_active=true', [employeeId, user.id]);
      if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy hồ sơ nhân viên đang hoạt động.' });
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`explanation-route:${employeeId}`]);
      await manager.query(`INSERT INTO attendance_periods(period_month,status) VALUES(date_trunc('month',$1::date)::date,'OPEN') ON CONFLICT(period_month) DO NOTHING`, [input.workDate]);
      const [period] = await manager.query<Array<{ status: string }>>(`SELECT status FROM attendance_periods WHERE period_month=date_trunc('month',$1::date)::date FOR UPDATE`, [input.workDate]);
      if (period.status === 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: 'Kỳ công đã chốt. Cần mở lại kỳ trước khi gửi giải trình.' });
      const existing = await repository.findOne({ where: { employeeId, workDate: input.workDate, issueType: input.issueType, status: In(['REQUESTED', 'SUBMITTED']) } });
      if (existing) throw new ConflictException({ code: 'EXPLANATION_ALREADY_REQUESTED', message: 'Đã có giải trình đang mở cho ngày và vấn đề này. Hãy xem đơn hiện có.' });
      if (input.evidenceImageReference?.trim()) {
        await manager.query('SELECT evidence_id FROM attendance_evidence_uploads WHERE filename=$1 FOR UPDATE', [input.evidenceImageReference.trim().split('/').at(-1)]);
        await this.evidenceStorage.assertOwnedReference(user, input.evidenceImageReference.trim(), manager);
      }
      const item = await repository.save(repository.create({
        employeeId, workDate: input.workDate, issueType: input.issueType,
        source: 'EMPLOYEE', submittedBy: user.id, submissionId: input.submissionId,
        requestedBy: null, dueAt: null, requestNote: '', status: 'SUBMITTED',
        responseText: input.responseText.trim(), evidenceImageReference: input.evidenceImageReference?.trim() || null,
        evidenceCapturedAt: input.evidenceCapturedAt ? new Date(input.evidenceCapturedAt) : null,
        evidenceLatitude: input.evidenceLatitude ?? null, evidenceLongitude: input.evidenceLongitude ?? null,
      }));
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,new_value,created_by) VALUES('ATTENDANCE_EXPLANATION',$1,'SUBMIT',$2::jsonb,$3)`, [item.id, JSON.stringify({ employeeId: item.employeeId, workDate: item.workDate, issueType: item.issueType, status: item.status, hasEvidence: Boolean(item.evidenceImageReference) }), user.id]);
      return this.workflow.initialize(manager, item, user.id, pushes);
    });
    await this.workflow.deliver(pushes);
    return saved;
  }
  async listMyExplanations(user: AuthenticatedUserView): Promise<unknown[]> {
    return this.workflow.list(user, undefined, true);
  }

  async respondToExplanation(user: AuthenticatedUserView, id: string, input: RespondAttendanceExplanationDto): Promise<AttendanceExplanationEntity> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Tài khoản chưa liên kết nhân viên.' });
    if (input.responseText.trim().length < 5) throw new BadRequestException({ code: 'EXPLANATION_CONTENT_REQUIRED', message: 'Nội dung giải trình cần ít nhất 5 ký tự.' });
    const pushes: Parameters<ExplanationWorkflowService['deliver']>[0] = [];
    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`explanation-route:${user.employeeId}`]);
      const repo = manager.getRepository(AttendanceExplanationEntity);
      const initial = await repo.findOneBy({ id });
      if (!initial || initial.employeeId !== user.employeeId) throw new NotFoundException({ code: 'EXPLANATION_NOT_FOUND', message: 'Không tìm thấy yêu cầu giải trình.' });
      await manager.query(`INSERT INTO attendance_periods(period_month,status) VALUES(date_trunc('month',$1::date)::date,'OPEN') ON CONFLICT(period_month) DO NOTHING`, [initial.workDate]);
      const [period] = await manager.query<Array<{ status: string }>>(`SELECT status FROM attendance_periods WHERE period_month=date_trunc('month',$1::date)::date FOR UPDATE`, [initial.workDate]);
      if (period.status === 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: 'Kỳ công đã chốt.' });
      const item = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!item || item.status !== 'REQUESTED') throw new ConflictException({ code: 'EXPLANATION_NOT_AWAITING_RESPONSE', message: 'Yêu cầu này không còn chờ phản hồi.' });
      if (item.dueAt && item.dueAt.getTime() < Date.now()) throw new ConflictException({ code: 'EXPLANATION_DEADLINE_PASSED', message: 'Yêu cầu giải trình đã quá hạn.' });
      if (!validateEvidence(item.issueType as CreateAttendanceExplanationDto['issueType'], input)) throw new BadRequestException({ code: 'INCOMPLETE_EXPLANATION_EVIDENCE', message: 'Minh chứng phải có ảnh tham chiếu và tọa độ đầy đủ nếu cung cấp.' });
      if (input.evidenceImageReference?.trim()) {
        await manager.query('SELECT evidence_id FROM attendance_evidence_uploads WHERE filename=$1 FOR UPDATE', [input.evidenceImageReference.trim().split('/').at(-1)]);
        await this.evidenceStorage.assertOwnedReference(user, input.evidenceImageReference.trim(), manager);
      }
      Object.assign(item, { responseText: input.responseText.trim(), evidenceImageReference: input.evidenceImageReference?.trim() || null,
        evidenceCapturedAt: input.evidenceCapturedAt ? new Date(input.evidenceCapturedAt) : null, evidenceLatitude: input.evidenceLatitude ?? null, evidenceLongitude: input.evidenceLongitude ?? null, status: 'SUBMITTED', submittedBy: user.id });
      await repo.save(item);
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,new_value,created_by) VALUES('ATTENDANCE_EXPLANATION',$1,'LEGACY_RESPOND',$2::jsonb,$3)`, [id, JSON.stringify({ status: 'SUBMITTED', hasEvidence: Boolean(item.evidenceImageReference) }), user.id]);
      return this.workflow.initialize(manager, item, user.id, pushes);
    });
    await this.workflow.deliver(pushes); return saved;
  }

  async reviewExplanation(user: AuthenticatedUserView, id: string, input: ReviewAttendanceExplanationDto): Promise<AttendanceExplanationEntity> {
    return this.workflow.process(user, id, input, false);
  }

  private async evaluateRisk(employeeId: string, input: RecordAttendanceEventDto, now: Date, reader: Pick<EntityManager, 'query'> = this.dataSource): Promise<AttendanceRiskResult> {
    const flags: string[] = [];
    let officeLocation: OfficeGeofenceResult | null = null;
    if (input.mockLocationSignal) flags.push(AttendanceRiskFlag.MockLocationSignal);
    if (input.attendanceType === 'OFFICE') {
      const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      const locations = await reader.query<OfficeLocationEntity[]>(
        `SELECT id, name, address, latitude, longitude, radius_meters AS "radiusMeters",
          accuracy_threshold_meters AS "accuracyThresholdMeters", branch_id AS "branchId",
          location_type AS "locationType", is_active AS "isActive"
         FROM office_locations l
         WHERE l.is_active=true AND (l.branch_id IS NULL OR l.branch_id IN (
           SELECT a.branch_id FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id AND b.is_active
           WHERE a.employee_id=$1 AND a.effective_from <= $2::date
             AND (a.effective_to IS NULL OR a.effective_to >= $2::date)
         ))`,
        [employeeId, date],
      );
      const point = { latitude: input.latitude, longitude: input.longitude };
      const location = locations
        .map((candidate) => ({ candidate, geofence: new OfficeGeofence({ latitude: candidate.latitude, longitude: candidate.longitude }, candidate.radiusMeters) }))
        .sort((a, b) => a.geofence.distanceFromCenter(point) - b.geofence.distanceFromCenter(point))[0];
      if (!location) throw new NotFoundException({ code: 'OFFICE_LOCATION_NOT_CONFIGURED', message: 'Chưa cấu hình vị trí làm việc cho chi nhánh của nhân viên.' });
      const distanceMeters = location.geofence.distanceFromCenter(point);
      officeLocation = {
        accuracyThresholdMeters: location.candidate.accuracyThresholdMeters,
        address: location.candidate.address,
        distanceMeters,
        id: location.candidate.id,
        name: location.candidate.name,
        radiusMeters: location.candidate.radiusMeters,
      };
      if (distanceMeters > location.candidate.radiusMeters) flags.push(AttendanceRiskFlag.OutsideGeofence);
      if (input.accuracyMeters !== undefined && input.accuracyMeters > location.candidate.accuracyThresholdMeters) flags.push(AttendanceRiskFlag.LowAccuracy);
    } else if (input.accuracyMeters !== undefined && input.accuracyMeters > 50) flags.push(AttendanceRiskFlag.LowAccuracy);
    const schedule = await this.resolveSchedule(employeeId, now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), reader);
    if (schedule) flags.push(...evaluateScheduleRisk(input.eventType, localMinutes(now), schedule));
    return { flags, officeLocation };
  }

  private assertSafeLocation(risk: AttendanceRiskResult, eventType: string): void {
    const blocked = risk.flags.filter(flag => flag === 'MOCK_LOCATION_SIGNAL' || flag === 'LOW_ACCURACY' || (eventType === 'CHECK_IN' && flag === 'OUTSIDE_GEOFENCE'));
    if (blocked.length) throw new ForbiddenException({ code: 'ATTENDANCE_LOCATION_REJECTED', message: 'GPS giả, sai số quá lớn hoặc check-in ngoài vùng cho phép. Hãy lấy vị trí thật/chính xác hơn; nếu không thể chấm công, gửi giải trình.', riskFlags: blocked });
  }

  private async resolveSchedule(employeeId: string, date: string, reader: Pick<EntityManager, 'query'> = this.dataSource): Promise<ScheduleRow | null> {
    const [schedule] = await reader.query<ScheduleRow[]>(
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
       , selected AS (
         SELECT ws.* FROM candidates c JOIN work_schedules ws ON ws.id=c.schedule_id
         WHERE ws.is_active=true ORDER BY c.priority,c.effective_from DESC,ws.id LIMIT 1
       )
       SELECT ws.id, ws.start_time AS "startTime", ws.end_time AS "endTime",
         ws.late_tolerance_minutes AS "lateToleranceMinutes",
         ws.early_leave_tolerance_minutes AS "earlyLeaveToleranceMinutes",
         ws.required_work_minutes AS "requiredWorkMinutes"
       FROM selected ws
       WHERE extract(isodow from $2::date)::int=ANY(ws.weekdays)`,
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

  private async getCurrentValue(employeeId: string, workDate: string, fieldName: string, reader: Pick<EntityManager, 'query'>): Promise<string | null> {
    const [latest] = await reader.query<Array<{ value: string }>>(
      `SELECT new_value#>>'{}' AS value FROM attendance_adjustments WHERE employee_id=$1 AND work_date=$2::date AND field_name=$3 ORDER BY created_at DESC LIMIT 1`,
      [employeeId, workDate, fieldName],
    );
    if (latest) return latest.value;
    if (fieldName === 'DAY_STATUS') {
      const [row] = await reader.query<Array<{ value: string }>>(`SELECT CASE
        WHEN COUNT(a.id) FILTER(WHERE a.event_type='CHECK_OUT')>0 THEN 'CHECKED_OUT'
        WHEN COUNT(a.id) FILTER(WHERE a.event_type='CHECK_IN')>0 THEN 'CHECKED_IN'
        ELSE 'NOT_CHECKED_IN' END AS value FROM employees e LEFT JOIN attendance_events a
        ON a.employee_id=e.id AND (a.server_time AT TIME ZONE 'Asia/Bangkok')::date=$2::date
        WHERE e.id=$1 AND e.is_active GROUP BY e.id`, [employeeId,workDate]);
      return row?.value ?? null;
    }
    const eventType = fieldName === 'CHECK_IN_TIME' ? 'CHECK_IN' : 'CHECK_OUT';
    const [event] = await reader.query<Array<{ value: string }>>(
      `SELECT server_time::text AS value FROM attendance_events WHERE employee_id=$1 AND event_type=$2 AND (server_time AT TIME ZONE 'Asia/Bangkok')::date=$3::date ORDER BY server_time ${eventType === 'CHECK_IN' ? 'ASC' : 'DESC'} LIMIT 1`,
      [employeeId, eventType, workDate],
    );
    return event?.value ?? null;
  }

  private async assertPeriodOpen(workDate: string, manager: EntityManager): Promise<void> {
    await manager.query(`INSERT INTO attendance_periods(period_month,status) VALUES(date_trunc('month',$1::date)::date,'OPEN') ON CONFLICT(period_month) DO NOTHING`, [workDate]);
    const [period] = await manager.query<Array<{ status: string }>>(`SELECT status FROM attendance_periods WHERE period_month=date_trunc('month',$1::date)::date FOR UPDATE`, [workDate]);
    if (period?.status === 'LOCKED') throw new ConflictException({ code: 'ATTENDANCE_PERIOD_LOCKED', message: 'Kỳ công đã chốt. Kế toán trưởng phải mở lại kỳ trước khi điều chỉnh.' });
  }
}
