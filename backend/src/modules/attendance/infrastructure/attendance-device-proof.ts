import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import type { RecordAttendanceEventDto, RegisterAttendanceDeviceDto } from '../attendance.dto.js';
import { AttendanceEvidenceStorage } from './attendance-evidence.storage.js';

interface Binding { id: string; user_id: string; device_id: string; public_key: string; fingerprint: string; status: string }
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function attendanceInputHash(input: RecordAttendanceEventDto): string {
  // Client time is diagnostics only. Every business-relevant supplied field is bound.
  return hash(JSON.stringify([input.eventType, input.attendanceType, input.latitude, input.longitude,
    input.accuracyMeters ?? null, input.mockLocationSignal ?? null, input.checkinCaptureId ?? null, input.businessTripId ?? null]));
}

/** No attestation verdict is invented: public-key proof is not proof of GPS/person. */
@Injectable()
export class AttendanceDeviceProof {
  constructor(@InjectDataSource() private readonly source: DataSource, private readonly evidence: AttendanceEvidenceStorage) {}

  async session(manager: EntityManager, user: AuthenticatedUserView, sid: string): Promise<{ device_id: string; device_name: string }> {
    // Same user -> session ordering as login/reset. Hold until commit so revoke/new login
    // cannot invalidate the session between the final check and event persistence.
    const [account] = await manager.query<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 AND is_active FOR SHARE', [user.id]);
    if (!account) throw new UnauthorizedException({ code: 'SESSION_USER_UNAVAILABLE', message: 'Tài khoản không còn hoạt động.' });
    const [session] = await manager.query<Array<{ device_id: string; device_name: string }>>(`SELECT device_id,device_name FROM auth_sessions
      WHERE id=$1 AND user_id=$2 AND client_type='MOBILE' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`, [sid, user.id]);
    if (!session) throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Cần phiên app còn hiệu lực để chấm công.' });
    return session;
  }

  async register(user: AuthenticatedUserView, sid: string, input: RegisterAttendanceDeviceDto): Promise<unknown> {
    if (!user.employeeId) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Chưa có hồ sơ nhân viên.' });
    let pem: string;
    try {
      const key = createPublicKey({ key: Buffer.from(input.publicKey, 'base64'), type: 'spki', format: 'der' });
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Unsupported key');
      pem = key.export({ type: 'spki', format: 'pem' }).toString();
    } catch { throw new BadRequestException({ code: 'DEVICE_KEY_INVALID', message: 'Khóa thiết bị không hợp lệ.' }); }
    const fingerprint = hash(pem);
    return this.source.transaction(async manager => {
      await manager.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      const session = await this.session(manager, user, sid);
      const [active] = await manager.query<Binding[]>(`SELECT * FROM attendance_devices WHERE user_id=$1 AND status='ACTIVE' FOR UPDATE`, [user.id]);
      if (active) {
        if (active.fingerprint !== fingerprint || active.device_id !== session.device_id) throw new ForbiddenException({ code: 'ATTENDANCE_DEVICE_MISMATCH', message: 'Tài khoản đã gắn điện thoại khác. Admin phải thu hồi thiết bị chấm công cũ trước.' });
        return { id: active.id, status: active.status, fingerprint: active.fingerprint };
      }
      const [pending] = await manager.query<Binding[]>(`SELECT * FROM attendance_devices WHERE user_id=$1 AND status='PENDING' FOR UPDATE`, [user.id]);
      if (pending && (pending.fingerprint !== fingerprint || pending.device_id !== session.device_id)) throw new ConflictException({ code: 'ATTENDANCE_DEVICE_PENDING', message: 'Đã có điện thoại chờ xác nhận. Nhờ Admin thu hồi yêu cầu cũ trước khi đổi.' });
      if (pending) return { id: pending.id, status: pending.status, fingerprint: pending.fingerprint };
      // First means no registration history, not merely no ACTIVE key. The user
      // row lock serializes competing first registrations and Admin revocation.
      // REVOKED history and legacy PENDING requests must never re-open auto-bind.
      const [history] = await manager.query<Array<{ used: boolean }>>('SELECT EXISTS(SELECT 1 FROM attendance_devices WHERE user_id=$1) AS used', [user.id]);
      const status = history.used ? 'PENDING' : 'ACTIVE';
      const reason = history.used ? null : 'Tự gắn thiết bị đầu tiên; chấm công vẫn yêu cầu sinh trắc từng lượt.';
      const [item] = await manager.query<Binding[]>(`INSERT INTO attendance_devices(user_id,employee_id,device_id,device_name,public_key,fingerprint,status,decided_at,decision_reason)
        SELECT $1,$2,$3,$4,$5,$6,$7::varchar,CASE WHEN $7::varchar='ACTIVE' THEN now() ELSE NULL END,$8 FROM employees WHERE id=$2 AND user_id=$1 AND is_active RETURNING *`, [user.id, user.employeeId, session.device_id, session.device_name, pem, fingerprint, status, reason]);
      if (!item) throw new BadRequestException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Hồ sơ không còn hoạt động.' });
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,new_value,created_by) VALUES('ATTENDANCE_DEVICE',$1,$2,$3::jsonb,$4)`, [item.id, history.used ? 'REGISTER' : 'AUTO_BIND_FIRST_DEVICE', JSON.stringify({ status, fingerprint, reason }), user.id]);
      return { id: item.id, status: item.status, fingerprint };
    });
  }

  async list(user: AuthenticatedUserView): Promise<unknown[]> {
    this.admin(user);
    return this.source.query(`SELECT d.id,d.device_name AS "deviceName",d.fingerprint,d.status,d.created_at AS "createdAt",d.decided_at AS "decidedAt",d.decision_reason AS "decisionReason",
      e.employee_code AS "employeeCode",e.full_name AS "fullName",u.email FROM attendance_devices d JOIN users u ON u.id=d.user_id JOIN employees e ON e.id=d.employee_id ORDER BY d.created_at DESC`);
  }

  async decide(user: AuthenticatedUserView, id: string, action: 'APPROVE' | 'REVOKE', reason: string): Promise<unknown> {
    this.admin(user);
    if (reason.trim().length < 5) throw new BadRequestException({ code: 'DEVICE_REASON_REQUIRED', message: 'Nhập lý do ít nhất 5 ký tự.' });
    return this.source.transaction(async manager => {
      const [owner] = await manager.query<Binding[]>('SELECT user_id FROM attendance_devices WHERE id=$1', [id]);
      if (!owner) throw new BadRequestException({ code: 'DEVICE_NOT_FOUND', message: 'Không tìm thấy thiết bị.' });
      await manager.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [owner.user_id]);
      const [item] = await manager.query<Binding[]>('SELECT * FROM attendance_devices WHERE id=$1 FOR UPDATE', [id]);
      if (item.status === 'REVOKED' || (action === 'APPROVE' && item.status !== 'PENDING')) throw new ConflictException({ code: 'DEVICE_STATE_CHANGED', message: 'Trạng thái đã thay đổi. Tải lại danh sách.' });
      if (action === 'APPROVE') {
        const [live] = await manager.query<Array<{ valid: boolean }>>(`SELECT u.is_active AND e.is_active AS valid FROM users u JOIN employees e ON e.user_id=u.id WHERE u.id=$1`, [owner.user_id]);
        if (!live?.valid) throw new ConflictException({ code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Hồ sơ không còn hoạt động.' });
        const [other] = await manager.query<Binding[]>(`SELECT id FROM attendance_devices WHERE user_id=$1 AND status='ACTIVE'`, [owner.user_id]);
        if (other) throw new ConflictException({ code: 'DEVICE_ALREADY_BOUND', message: 'Thu hồi điện thoại cũ trước khi duyệt máy mới.' });
      }
      const status = action === 'APPROVE' ? 'ACTIVE' : 'REVOKED';
      await manager.query('UPDATE attendance_devices SET status=$2,decided_at=now(),decided_by=$3,decision_reason=$4 WHERE id=$1', [id, status, user.id, reason.trim()]);
      await manager.query('DELETE FROM attendance_device_challenges WHERE device_binding_id=$1', [id]);
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by) VALUES('ATTENDANCE_DEVICE',$1,$2,$3::jsonb,$4::jsonb,$5)`, [id, action, JSON.stringify({ status: item.status, fingerprint: item.fingerprint }), JSON.stringify({ status, reason: reason.trim() }), user.id]);
      return { id, status };
    });
  }

  private admin(user: AuthenticatedUserView): void {
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Chỉ Admin quản lý thiết bị chấm công.' });
  }
  private async binding(manager: EntityManager, user: AuthenticatedUserView, deviceId: string): Promise<Binding> {
    const [item] = await manager.query<Binding[]>(`SELECT * FROM attendance_devices WHERE user_id=$1 AND device_id=$2 AND status='ACTIVE' FOR SHARE`, [user.id, deviceId]);
    if (!item) throw new ForbiddenException({ code: 'ATTENDANCE_DEVICE_REQUIRED', message: 'Điện thoại chưa được gắn với tài khoản hoặc đã bị thu hồi. Đổi máy/tạo lại khóa cần Admin xác nhận.' });
    return item;
  }

  async challenge(user: AuthenticatedUserView, sid: string, input: RecordAttendanceEventDto): Promise<unknown> {
    if (input.challengeId || input.signature) throw new BadRequestException({ code: 'INVALID_CHALLENGE_INPUT', message: 'Không gửi chữ ký khi xin thử thách.' });
    return this.source.transaction(async manager => {
      const session = await this.session(manager, user, sid), item = await this.binding(manager, user, session.device_id);
      // Serialize and bound outstanding challenges. No per-IP rules or VPN guessing.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`attendance-proof:${item.id}`]);
      await manager.query('DELETE FROM attendance_device_challenges WHERE device_binding_id=$1 AND consumed_at IS NULL', [item.id]);
      await manager.query('DELETE FROM attendance_device_challenges WHERE device_binding_id=$1 AND expires_at<now()', [item.id]);
      const expiresAt = new Date(Date.now() + 120_000), inputHash = attendanceInputHash(input);
      const evidenceHash = await this.photoHash(manager, user, input);
      const payload = JSON.stringify({ protocol: 'TM_ATTENDANCE_V1', nonce: randomBytes(32).toString('base64'), userId: user.id, sessionId: sid, deviceBindingId: item.id, inputHash, evidenceHash, expiresAt: expiresAt.toISOString() });
      const [row] = await manager.query<Array<{ id: string }>>(`INSERT INTO attendance_device_challenges(device_binding_id,user_id,session_id,payload,input_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [item.id, user.id, sid, payload, inputHash, expiresAt]);
      return { id: row.id, payload, expiresAt };
    });
  }

  async consume(manager: EntityManager, user: AuthenticatedUserView, sid: string, input: RecordAttendanceEventDto): Promise<void> {
    const session = await this.session(manager, user, sid);
    const item = await this.binding(manager, user, session.device_id);
    if (!input.challengeId || !input.signature) throw new ForbiddenException({ code: 'ATTENDANCE_PROOF_REQUIRED', message: 'Xác thực sinh trắc trên điện thoại đã đăng ký trước khi chấm công.' });
    const [row] = await manager.query<Array<{ payload: string; input_hash: string; expires_at: Date; consumed_at: Date | null }>>(`SELECT * FROM attendance_device_challenges WHERE id=$1 AND user_id=$2 AND session_id=$3 AND device_binding_id=$4 FOR UPDATE`, [input.challengeId, user.id, sid, item.id]);
    if (!row || row.consumed_at || row.expires_at <= new Date() || row.input_hash !== attendanceInputHash(input)) throw new ConflictException({ code: 'ATTENDANCE_PROOF_EXPIRED', message: 'Lượt xác thực đã dùng/hết hạn hoặc dữ liệu thay đổi. Tải lại rồi thử lại.' });
    const payload = JSON.parse(row.payload) as { evidenceHash: string | null };
    if (payload.evidenceHash !== await this.photoHash(manager, user, input)) throw new ConflictException({ code: 'ATTENDANCE_PHOTO_CHANGED', message: 'Ảnh đã thay đổi sau khi xin xác thực. Tải lại rồi chụp/xác thực lại.' });
    let valid = false;
    try { valid = verify('sha256', Buffer.from(row.payload, 'utf8'), item.public_key, Buffer.from(input.signature, 'base64')); } catch { /* Fail closed. */ }
    if (!valid) throw new ForbiddenException({ code: 'ATTENDANCE_PROOF_INVALID', message: 'Chữ ký thiết bị không hợp lệ.' });
    await manager.query('UPDATE attendance_device_challenges SET consumed_at=clock_timestamp() WHERE id=$1', [input.challengeId]);
  }

  private async photoHash(manager: EntityManager, user: AuthenticatedUserView, input: RecordAttendanceEventDto): Promise<string | null> {
    if (input.eventType !== 'CHECK_IN' || !input.checkinCaptureId) return null;
    // Same capture -> upload ordering as event/upload writers; never hold upload
    // then request capture, which would deadlock with a concurrent upload.
    const [capture] = await manager.query<Array<{id:string}>>('SELECT id FROM attendance_checkin_captures WHERE id=$1 AND user_id=$2 FOR SHARE',[input.checkinCaptureId,user.id]);
    if (!capture) return null; // Record handles absent/expired contexts explicitly.
    const [upload] = await manager.query<Array<{filename:string}>>('SELECT filename FROM attendance_evidence_uploads WHERE evidence_id=$1 AND uploaded_by=$2 FOR SHARE',[input.checkinCaptureId,user.id]);
    if (!upload) return null;
    const file = await this.evidence.read(upload.filename,user,manager);
    return createHash('sha256').update(file.buffer).digest('hex');
  }
}
