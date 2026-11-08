import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { PASSWORD_HASHER, type PasswordHasher } from '../auth/application/auth.ports.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { validatePassword } from '../auth/domain/password-policy.js';
import type { DeleteEmployeeDto, ResetEmployeePasswordDto } from './employees.dto.js';
import { EmployeeFileCleanup, isEmployeeEvidenceFilename } from './infrastructure/employee-file-cleanup.js';

interface EmployeeRow { id: string; employee_code: string; full_name: string; user_id: string | null; is_active: boolean; snapshot: unknown }
interface ImpactRow { table: string; count: number; fingerprint: string }

// Only rows owned by the deleted employee are erased. Shared trips, other
// employees' decisions and immutable audit records are deliberately not purged.
const ownedTables = [
  'employee_portraits',
  'attendance_explanation_requests', 'attendance_explanation_routes',
  'leave_requests', 'leave_approval_routes', 'overtime_requests', 'overtime_approval_routes', 'attendance_adjustments',
  'attendance_events', 'attendance_checkin_captures', 'employee_leave_balances', 'employee_disciplinary_actions',
  'organization_team_memberships', 'employee_schedules',
  'employee_organization_assignments', 'business_trip_members',
  'announcement_recipients', 'push_device_tokens',
] as const;
// Portrait writes first take ROW EXCLUSIVE on employees; avoid the opposite table-lock order.
const lockTables = [...ownedTables.filter(table => table !== 'employee_portraits'), 'employees', 'users', 'announcements',
  'attendance_evidence_uploads', 'business_trip_evidence_uploads', 'auth_sessions', 'user_roles', 'user_branch_scopes',
  'organization_management_grants', 'leave_balance_adjustments'].sort();

@Injectable()
export class EmployeeAdminService {
  constructor(@InjectDataSource() private readonly db: DataSource,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly files: EmployeeFileCleanup) {}

  async account(actor: AuthenticatedUserView, id: string): Promise<unknown> {
    this.admin(actor);
    const employee = await this.employee(this.db.manager, id);
    const [account] = employee.user_id ? await this.db.query<Array<{ username: string; isActive: boolean }>>(
      'SELECT email AS username,is_active AS "isActive" FROM users WHERE id=$1', [employee.user_id]) : [];
    return { employeeId: id, employeeCode: employee.employee_code, fullName: employee.full_name, account: account ?? null };
  }

  async resetPassword(actor: AuthenticatedUserView, id: string, input: ResetEmployeePasswordDto): Promise<unknown> {
    this.admin(actor); this.reason(input.reason);
    const error = validatePassword(input.newPassword);
    if (error) throw new BadRequestException({ code: 'INVALID_PASSWORD', message: error });
    const hash = await this.hasher.hash(input.newPassword);
    return this.db.transaction(async manager => {
      // Account lock is shared with login/refresh so an old-password login cannot
      // leave a valid session behind after the reset commits.
      const employee = await this.employee(manager, id);
      if (!employee.user_id) throw new BadRequestException({ code: 'EMPLOYEE_ACCOUNT_REQUIRED', message: 'Nhân viên chưa có tài khoản để đặt lại mật khẩu.' });
      const [account] = await manager.query<Array<{ email: string }>>('SELECT email FROM users WHERE id=$1 FOR UPDATE', [employee.user_id]);
      const current = await this.employee(manager, id);
      if (current.user_id !== employee.user_id) throw this.changed();
      await manager.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [employee.user_id, hash]);
      const sessions = await manager.query<Array<{ id: string }>>(`UPDATE auth_sessions SET revoked_at=now(),revoke_reason='PASSWORD_RESET',
        refresh_token_hash=NULL,previous_refresh_token_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`, [employee.user_id]);
      await manager.query('UPDATE push_device_tokens SET is_active=false,updated_at=now() WHERE user_id=$1', [employee.user_id]);
      await this.audit(manager, actor.id, id, 'PASSWORD_RESET', { reason: input.reason.trim(), revokedSessions: sessions.length });
      return { username: account.email, revokedSessions: sessions.length, currentAccountInvalidated: employee.user_id === actor.id };
    });
  }

  async deletionImpact(actor: AuthenticatedUserView, id: string): Promise<unknown> {
    this.admin(actor);
    return this.db.transaction('REPEATABLE READ', async manager => {
      const employee = await this.employee(manager, id);
      const impact = await this.impact(manager, employee);
      return { employeeId: id, employeeCode: employee.employee_code, fullName: employee.full_name,
        counts: Object.fromEntries(impact.map(row => [row.table, row.count])),
        confirmationToken: this.token(employee, impact), hasAccount: !!employee.user_id, isCurrentAccount: employee.user_id === actor.id };
    });
  }

  async delete(actor: AuthenticatedUserView, id: string, input: DeleteEmployeeDto): Promise<unknown> {
    this.admin(actor); this.reason(input.reason);
    const result = await this.db.transaction(async manager => {
      // Brief table locks prevent inserts/edits after the confirmation snapshot
      // is rechecked, including new FK children and a concurrent login.
      await manager.query("SET LOCAL lock_timeout='5s'");
      await manager.query(`LOCK TABLE ${lockTables.join(',')} IN SHARE ROW EXCLUSIVE MODE`);
      const employee = await this.employee(manager, id);
      if (input.employeeCode !== employee.employee_code) throw new BadRequestException({ code: 'EMPLOYEE_DELETE_CONFIRMATION_REQUIRED', message: 'Nhập chính xác mã nhân viên để xác nhận xóa.' });
      const impact = await this.impact(manager, employee);
      if (this.token(employee, impact) !== input.confirmationToken) throw this.changed();
      const evidence = await manager.query<Array<{ kind: string; filename: string }>>(`
        SELECT 'ATTENDANCE' AS kind,filename FROM attendance_evidence_uploads WHERE uploaded_by=$2
          AND NOT EXISTS(SELECT 1 FROM attendance_explanation_requests other WHERE other.employee_id<>$1 AND other.evidence_image_reference='/api/attendance/evidence/'||filename)
        UNION SELECT 'ATTENDANCE',substring(evidence_image_reference from '/([^/]+)$') FROM attendance_explanation_requests
          WHERE employee_id=$1 AND evidence_image_reference IS NOT NULL
          AND evidence_image_reference ~ '^/api/attendance/evidence/[0-9A-Fa-f-]{36}[.](jpg|png|webp)$'
          AND NOT EXISTS(SELECT 1 FROM attendance_explanation_requests other WHERE other.employee_id<>$1 AND other.evidence_image_reference=attendance_explanation_requests.evidence_image_reference)
        UNION SELECT 'TRIP',filename FROM business_trip_evidence_uploads WHERE uploaded_by=$2
          AND NOT EXISTS(SELECT 1 FROM business_trip_members other WHERE other.employee_id<>$1 AND other.evidence_image_reference='/api/business-trips/evidence/'||filename)
        UNION SELECT 'TRIP',substring(evidence_image_reference from '/([^/]+)$') FROM business_trip_members
          WHERE employee_id=$1 AND evidence_image_reference IS NOT NULL
          AND evidence_image_reference ~ '^/api/business-trips/evidence/[0-9A-Fa-f-]{36}[.](jpg|png|webp)$'
          AND NOT EXISTS(SELECT 1 FROM business_trip_members other WHERE other.employee_id<>$1 AND other.evidence_image_reference=business_trip_members.evidence_image_reference)`, [id, employee.user_id]);
      for (const file of evidence) {
        // Legacy arbitrary/external references are never filesystem targets and
        // must not prevent an otherwise authorized deletion.
        if (!isEmployeeEvidenceFilename(file.filename)) continue;
        await manager.query(`INSERT INTO employee_file_cleanup(storage_kind,filename)
          VALUES($1,$2) ON CONFLICT DO NOTHING`, [file.kind, file.filename]);
      }
      for (const table of ownedTables) await manager.query(`DELETE FROM ${table} WHERE employee_id=$1`, [id]);
      // Individual announcements cannot survive with a NULL target (DB CHECK).
      await manager.query('DELETE FROM announcements WHERE employee_id=$1', [id]);
      if (employee.user_id) {
        await manager.query(`DELETE FROM attendance_evidence_uploads WHERE uploaded_by=$1
          AND NOT EXISTS(SELECT 1 FROM attendance_explanation_requests x WHERE x.evidence_image_reference='/api/attendance/evidence/'||filename)`, [employee.user_id]);
        await manager.query(`DELETE FROM business_trip_evidence_uploads WHERE uploaded_by=$1
          AND NOT EXISTS(SELECT 1 FROM business_trip_members x WHERE x.evidence_image_reference='/api/business-trips/evidence/'||filename)`, [employee.user_id]);
        await manager.query('DELETE FROM auth_sessions WHERE user_id=$1', [employee.user_id]);
        await manager.query('DELETE FROM user_roles WHERE user_id=$1', [employee.user_id]);
        await manager.query('DELETE FROM user_branch_scopes WHERE user_id=$1', [employee.user_id]);
        await manager.query(`UPDATE organization_management_grants SET revoked_at=now(),revoked_by=$2,revocation_reason=$3
          WHERE user_id=$1 AND revoked_at IS NULL`, [employee.user_id, actor.id, input.reason.trim()]);
        // Keep a non-login technical actor for shared decisions/audit FKs; erase
        // the login name/hash, free the old username and never recreate sessions.
        await manager.query(`UPDATE users SET email=$2,password_hash='DELETED_NOT_A_CREDENTIAL',is_active=false,updated_at=now() WHERE id=$1`,
          [employee.user_id, `deleted-${employee.user_id}@deleted.invalid`]);
      }
      await manager.query('DELETE FROM employees WHERE id=$1', [id]);
      const counts = Object.fromEntries(impact.map(row => [row.table, row.count]));
      await this.audit(manager, actor.id, id, 'DELETED', { reason: input.reason.trim(), employeeCode: employee.employee_code,
        deletedCounts: counts, technicalActorRetained: !!employee.user_id });
      return { deleted: true, employeeId: id, counts, currentAccountInvalidated: employee.user_id === actor.id };
    }).catch((error: unknown) => {
      const code = (error as { driverError?: { code?: string }; code?: string }).driverError?.code ?? (error as { code?: string }).code;
      if (['40P01','40001','55P03','23503'].includes(code ?? '')) throw this.changed();
      throw error;
    });
    // A disk/worker failure cannot turn a committed deletion into a misleading
    // HTTP error; the durable queue remains pending for the scheduled retry.
    const evidenceCleanupPending = await this.files.drain().catch(() => -1);
    return { ...result, evidenceCleanupPending };
  }

  private async impact(manager: EntityManager, employee: EmployeeRow): Promise<ImpactRow[]> {
    const result: ImpactRow[] = [];
    const sources = [
      ...ownedTables.map(table => ({ table, where: 'employee_id=$1' })),
      { table: 'announcements', where: 'employee_id=$1' },
      { table: 'attendance_evidence_uploads', where: 'uploaded_by=$2' },
      { table: 'business_trip_evidence_uploads', where: 'uploaded_by=$2' },
      { table: 'auth_sessions', where: 'user_id=$2' },
      { table: 'user_roles', where: 'user_id=$2' },
      { table: 'users', where: 'id=$2' },
      { table: 'user_branch_scopes', where: 'user_id=$2' },
      { table: 'organization_management_grants', where: 'user_id=$2' },
      { table: 'business_trips', where: 'responsible_employee_id=$1' },
      { table: 'manager_assignments', source: 'employee_organization_assignments', where: 'manager_employee_id=$1 AND employee_id<>$1' },
      { table: 'explanation_reviewer_routes', source: 'attendance_explanation_routes', where: 'employee_id<>$1 AND (leader_user_id=$2 OR head_user_id=$2)' },
      { table: 'leave_reviewer_routes', source: 'leave_approval_routes', where: 'employee_id<>$1 AND (leader_user_id=$2 OR head_user_id=$2)' },
      { table: 'overtime_reviewer_routes', source: 'overtime_approval_routes', where: 'employee_id<>$1 AND (leader_user_id=$2 OR head_user_id=$2)' },
    ];
    for (const item of sources) {
      // Read-only authentication touches last_seen_at. This must not invalidate
      // self-deletion just because its protected DELETE authenticates again.
      const value = item.table === 'auth_sessions' ? "(to_jsonb(t)-'last_seen_at')" : 'to_jsonb(t)';
      const [row] = await manager.query<Array<{ count: number; fingerprint: string }>>(`SELECT count(*)::int AS count,
        md5(COALESCE(string_agg(${value}::text,'|' ORDER BY ${value}::text),'')) AS fingerprint
        FROM ${'source' in item ? item.source : item.table} t WHERE ${item.where} AND $1::uuid IS NOT NULL AND ($2::uuid IS NULL OR $2::uuid IS NOT NULL)`, [employee.id, employee.user_id]);
      result.push({ table: item.table, ...row });
    }
    return result;
  }
  private token(employee: EmployeeRow, impact: ImpactRow[]): string { return createHash('sha256').update(JSON.stringify({ employee, impact })).digest('hex'); }
  private admin(actor: AuthenticatedUserView): void { if (!actor.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Chỉ Admin được quản lý tài khoản hoặc xóa nhân sự.' }); }
  private reason(value: string): void { if (value.trim().length < 5) throw new BadRequestException({ code: 'EMPLOYEE_REASON_REQUIRED', message: 'Lý do phải có ít nhất 5 ký tự.' }); }
  private changed(): ConflictException { return new ConflictException({ code: 'EMPLOYEE_CHANGED', message: 'Dữ liệu đã thay đổi hoặc đang được xử lý. Tải lại ảnh hưởng và xác nhận lại.' }); }
  private async employee(manager: EntityManager, id: string): Promise<EmployeeRow> {
    const [row] = await manager.query<EmployeeRow[]>('SELECT id,employee_code,full_name,user_id,is_active,to_jsonb(e) AS snapshot FROM employees e WHERE id=$1', [id]);
    if (!row) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy nhân viên.' });
    return row;
  }
  private async audit(manager: EntityManager, actor: string, id: string, action: string, value: unknown): Promise<void> {
    await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,new_value,created_by)
      VALUES('EMPLOYEE',$1,$2,$3::jsonb,$4)`, [id, action, JSON.stringify(value), actor]);
  }
}
