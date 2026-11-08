import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { canDeleteCatalog, catalogDefinitions, isCatalogKind, type CatalogKind } from '../domain/catalog-lifecycle.js';
import type { CatalogDecisionDto, CreateCatalogDto, UpdateCatalogDto } from '../presentation/catalog.dto.js';

export interface CatalogRow { id: string; code: string; name: string; isActive: boolean; departmentId?: string }
interface CatalogOperationalImpact { teams: number; grants: number; pendingExplanations: number; pendingLeave: number; employees: number }
export interface CatalogImpact {
  item: CatalogRow; references: { label: string; count: number }[]; everUsed: boolean; canDelete: boolean;
  impacts: CatalogOperationalImpact; confirmationToken: string;
}
interface Reference { source: string; column: string; label: string }
const referenceLabels: Record<string, string> = {
  employees: 'Hồ sơ nhân viên', employee_organization_assignments: 'Phân công tổ chức (gồm lịch sử)',
  user_branch_scopes: 'Phạm vi tài khoản', department_schedules: 'Lịch phòng ban',
  office_locations: 'Vị trí làm việc', announcements: 'Thông báo', organization_teams: 'Team',
  organization_team_memberships: 'Thành viên team (gồm đã rút)', organization_management_grants: 'Quyền quản lý (gồm đã thu hồi)',
  attendance_explanation_routes: 'Tuyến giải trình mặc định', attendance_explanation_requests: 'Đơn giải trình',
  leave_approval_routes: 'Tuyến nghỉ phép mặc định', leave_requests: 'Đơn nghỉ phép',
};
const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

@Injectable()
export class CatalogService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private kind(value: string): CatalogKind {
    if (!isCatalogKind(value)) throw new BadRequestException({ code: 'INVALID_CATALOG', message: 'Danh mục không hợp lệ.' });
    return value;
  }

  private admin(user: AuthenticatedUserView): void {
    if (!user.roles.includes(RoleCode.Admin)) throw new ForbiddenException({ code: 'CATALOG_ACCESS_DENIED', message: 'Chỉ Admin được quản trị danh mục.' });
  }

  private text(value: string): string {
    if (!value.trim()) throw new BadRequestException({ code: 'EMPTY_CATALOG_VALUE', message: 'Mã và tên không được để trống.' });
    return value.trim();
  }

  private code(value: string): string {
    const code = this.text(value).toUpperCase();
    if ([...code].length > 30) throw new BadRequestException({ code: 'CATALOG_CODE_TOO_LONG', message: 'Mã sau chuẩn hóa không được dài quá 30 ký tự.' });
    return code;
  }

  private async row(manager: EntityManager, kind: CatalogKind, id: string, lock = false): Promise<CatalogRow> {
    const [row] = await manager.query<CatalogRow[]>(`SELECT id,code,name,is_active AS "isActive"
      ${kind === 'teams' ? ',department_id AS "departmentId"' : ''} FROM ${catalogDefinitions[kind].table}
      WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
    if (!row) throw new NotFoundException({ code: 'CATALOG_NOT_FOUND', message: 'Danh mục không còn tồn tại. Hãy tải lại.' });
    return row;
  }

  async list(user: AuthenticatedUserView, value: string): Promise<unknown[]> {
    this.admin(user);
    const kind = this.kind(value);
    return this.db.query(`SELECT t.id,t.code,t.name,t.is_active AS "isActive",
      EXISTS(SELECT 1 FROM organization_catalog_usage u WHERE u.catalog_table=$1 AND u.catalog_id=t.id) AS "everUsed"
      FROM ${catalogDefinitions[kind].table} t ORDER BY t.name,t.id`, [catalogDefinitions[kind].table]);
  }

  private async references(manager: EntityManager, kind: CatalogKind): Promise<Reference[]> {
    const rows = await manager.query<Array<{ source: string; column: string }>>(`SELECT source.relname AS source,a.attname AS column
      FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=source.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      WHERE c.contype='f' AND cardinality(c.conkey)=1 AND n.nspname='public'
        AND c.confrelid=to_regclass($1) ORDER BY source.relname,a.attname`, [catalogDefinitions[kind].table]);
    return rows.map(row => ({ ...row, label: referenceLabels[row.source] ?? row.source }));
  }

  private async preview(manager: EntityManager, kind: CatalogKind, item: CatalogRow): Promise<CatalogImpact> {
    const references = [];
    const fingerprint: unknown[] = [item];
    for (const ref of await this.references(manager, kind)) {
      // Hash IDs/state without returning personnel/request contents to the UI.
      const [result] = await manager.query<Array<{ count: number; hash: string | null }>>(`SELECT count(*)::int AS count,
        md5(string_agg(to_jsonb(r)::text,'|' ORDER BY to_jsonb(r)::text)) AS hash
        FROM ${quote(ref.source)} r WHERE ${quote(ref.column)}=$1`, [item.id]);
      if (result.count) references.push({ label: ref.label, count: result.count });
      fingerprint.push([ref.source,ref.column,result.count,result.hash]);
    }
    const [usage] = await manager.query<Array<{ used: boolean }>>(`SELECT EXISTS(SELECT 1 FROM organization_catalog_usage
      WHERE catalog_table=$1 AND catalog_id=$2) AS used`, [catalogDefinitions[kind].table,item.id]);
    const referenceCount = references.reduce((sum, ref) => sum + ref.count, 0);
    const impacts = await this.operationalImpact(manager, kind, item.id);
    fingerprint.push(usage.used, impacts);
    return { item, references, everUsed: usage.used, canDelete: canDeleteCatalog(usage.used,referenceCount), impacts,
      confirmationToken: createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex') };
  }

  private async operationalImpact(manager: EntityManager, kind: CatalogKind, id: string): Promise<CatalogOperationalImpact> {
    const scope = kind === 'teams' ? 't.id=$1' : kind === 'departments' ? 't.department_id=$1' : kind === 'branches'
      ? `EXISTS(SELECT 1 FROM organization_team_memberships m JOIN employee_organization_assignments a
          ON a.employee_id=m.employee_id AND a.department_id=t.department_id WHERE m.team_id=t.id AND m.ended_at IS NULL
          AND a.branch_id=$1 AND a.effective_from<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
          AND (a.effective_to IS NULL OR a.effective_to>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))` : 'false';
    const [result] = await manager.query<Array<{ teams: number; grants: number; pendingExplanations: number; pendingLeave: number }>>(`SELECT
      (SELECT count(*)::int FROM organization_teams t WHERE ${scope} AND t.is_active) AS teams,
      (SELECT count(*)::int FROM organization_management_grants g WHERE g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until>now())
        AND (g.team_id IN (SELECT t.id FROM organization_teams t WHERE ${scope}) ${kind === 'departments' ? 'OR g.department_id=$1' : ''})) AS grants,
      (SELECT count(*)::int FROM attendance_explanation_requests x WHERE x.status='SUBMITTED'
        AND x.workflow_team_id IN (SELECT t.id FROM organization_teams t WHERE ${scope})) AS "pendingExplanations",
      (SELECT count(*)::int FROM leave_requests x WHERE x.status='SUBMITTED'
        AND x.workflow_team_id IN (SELECT t.id FROM organization_teams t WHERE ${scope})) AS "pendingLeave"`,
      kind !== 'positions' ? [id] : []);
    const [people] = await manager.query<Array<{ employees: number }>>(kind === 'teams'
      ? `SELECT count(DISTINCT employee_id)::int AS employees FROM organization_team_memberships WHERE team_id=$1 AND ended_at IS NULL`
      : `SELECT count(DISTINCT employee_id)::int AS employees FROM employee_organization_assignments
          WHERE ${kind === 'branches' ? 'branch_id' : kind === 'departments' ? 'department_id' : 'position_id'}=$1
            AND effective_from<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            AND (effective_to IS NULL OR effective_to>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`, [id]);
    return { employees: people.employees, ...result };
  }

  async impact(user: AuthenticatedUserView, value: string, id: string): Promise<CatalogImpact> {
    this.admin(user);
    const kind = this.kind(value);
    return this.db.transaction('REPEATABLE READ', async manager => this.preview(manager,kind,await this.row(manager,kind,id)));
  }

  private async audit(manager: EntityManager, user: AuthenticatedUserView, kind: CatalogKind, id: string, action: string, before: unknown, after: unknown): Promise<void> {
    await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`, [catalogDefinitions[kind].resourceType,id,action,JSON.stringify(before),JSON.stringify(after),user.id]);
  }

  private reason(input: CatalogDecisionDto): string {
    if (input.reason.trim().length<5) throw new BadRequestException({ code: 'CATALOG_REASON_REQUIRED', message: 'Lý do cần ít nhất 5 ký tự.' });
    return input.reason.trim();
  }

  private conflict(error: unknown): never {
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new ConflictException({ code: 'CATALOG_CODE_EXISTS', message: 'Mã đã tồn tại. Hãy chọn mã khác.' });
    if (code === '23503') throw new ConflictException({ code: 'CATALOG_IN_USE', message: 'Danh mục đã được sử dụng; chỉ được ngừng sử dụng, không xóa.' });
    throw error;
  }

  async create(user: AuthenticatedUserView, value: string, input: CreateCatalogDto): Promise<CatalogRow> {
    this.admin(user);
    const kind = this.kind(value);
    if (kind === 'teams') throw new BadRequestException({ code: 'TEAM_DEPARTMENT_REQUIRED', message: 'Tạo team tại biểu mẫu team có phòng ban.' });
    try {
      return await this.db.transaction(async manager => {
        const [row] = await manager.query<Array<{ id: string }>>(`INSERT INTO ${catalogDefinitions[kind].table}(code,name)
          VALUES($1,$2) RETURNING id`, [this.code(input.code),this.text(input.name)]);
        const after = await this.row(manager,kind,row.id);
        await this.audit(manager,user,kind,row.id,'CREATE',null,after);
        return after;
      });
    } catch (error) { this.conflict(error); }
  }

  async update(user: AuthenticatedUserView, value: string, id: string, input: UpdateCatalogDto): Promise<CatalogRow> {
    this.admin(user);
    const kind = this.kind(value);
    const reason = this.reason(input);
    try {
      return await this.db.transaction(async manager => {
        const before = await this.row(manager,kind,id,true);
        const preview = await this.preview(manager,kind,before);
        if (preview.confirmationToken!==input.confirmationToken) throw new ConflictException({ code: 'CATALOG_CHANGED', message: 'Danh mục hoặc dữ liệu liên quan đã thay đổi. Tải lại ảnh hưởng rồi xác nhận lại.' });
        if (kind==='teams') {
          if (input.code !== undefined && input.code!==before.code) throw new BadRequestException({ code: 'TEAM_CODE_IMMUTABLE', message: 'Mã team không được đổi.' });
          if (input.isActive) await requireActiveCatalogReferences(manager, { departments: [before.departmentId!] });
        }
        await manager.query(`UPDATE ${catalogDefinitions[kind].table} SET code=$2,name=$3,is_active=$4 WHERE id=$1`,
          [id,kind==='teams' ? before.code : this.code(input.code ?? before.code),this.text(input.name),input.isActive]);
        const after = await this.row(manager,kind,id);
        const action = before.isActive!==after.isActive ? after.isActive ? 'REACTIVATE' : 'DEACTIVATE' : 'UPDATE';
        await this.audit(manager,user,kind,id,action,before,{ ...after,reason,impacts: preview.impacts });
        return after;
      });
    } catch (error) { this.conflict(error); }
  }

  async remove(user: AuthenticatedUserView, value: string, id: string, input: CatalogDecisionDto): Promise<{ id: string }> {
    this.admin(user);
    const kind = this.kind(value);
    const reason = this.reason(input);
    try {
      return await this.db.transaction(async manager => {
        const before = await this.row(manager,kind,id,true);
        const preview = await this.preview(manager,kind,before);
        if (!preview.canDelete) throw new ConflictException({ code: 'CATALOG_IN_USE', message: 'Danh mục đã được sử dụng; chỉ được ngừng sử dụng, không xóa.' });
        if (preview.confirmationToken!==input.confirmationToken) throw new ConflictException({ code: 'CATALOG_CHANGED', message: 'Dữ liệu đã thay đổi. Hãy tải lại trước khi xóa.' });
        await manager.query(`DELETE FROM ${catalogDefinitions[kind].table} WHERE id=$1`, [id]);
        await this.audit(manager,user,kind,id,'DELETE',before,{ reason });
        return { id };
      });
    } catch (error) { this.conflict(error); }
  }
}

// Used only at creation/reassignment points. Existing history remains readable.
export async function requireActiveCatalogReferences(manager: EntityManager, references: Partial<Record<Exclude<CatalogKind, 'teams'>, string[]>>): Promise<void> {
  for (const kind of ['branches','departments','positions'] as const) {
    const ids = [...new Set(references[kind] ?? [])];
    if (!ids.length) continue;
    const rows = await manager.query<Array<{ id: string }>>(`SELECT id FROM ${catalogDefinitions[kind].table}
      WHERE id=ANY($1::uuid[]) AND is_active ORDER BY id FOR SHARE`, [ids]);
    if (rows.length!==ids.length) throw new BadRequestException({ code: 'CATALOG_INACTIVE', message: 'Chi nhánh/phòng ban/chức vụ đã ngừng sử dụng hoặc không tồn tại. Hãy chọn danh mục đang hoạt động.' });
  }
}
