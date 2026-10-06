import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { grantCoversTeam, grantStatus, validGrantWindow, type ManagementGrant } from '../domain/management-access.js';
import type { CreateManagementGrantDto, CreateTeamDto, UpdateTeamDto } from '../presentation/organization-access.dto.js';

interface Team {
  id: string;
  departmentId: string;
  departmentName: string;
  code: string;
  name: string;
  isActive: boolean;
  departmentActive: boolean;
}

interface Member {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  eligible: boolean;
  branches: string[];
}

interface EmployeeSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  branches: string[];
}

// Organization assignments use calendar dates in Vietnam. Grant windows use exact instants.
const organizationDate = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const currentAssignment = (alias: string): string => `${alias}.effective_from <= ${organizationDate}
  AND (${alias}.effective_to IS NULL OR ${alias}.effective_to >= ${organizationDate})`;
const teamSelect = `SELECT t.id, t.department_id AS "departmentId", d.name AS "departmentName",
  t.code,t.name,t.is_active AS "isActive",d.is_active AS "departmentActive"
  FROM organization_teams t JOIN departments d ON d.id=t.department_id`;

@Injectable()
export class OrganizationAccessService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private assertAdmin(user: AuthenticatedUserView): void {
    if (!user.roles.includes(RoleCode.Admin)) this.denied();
  }

  private denied(): never {
    throw new ForbiddenException({ code: 'ORGANIZATION_ACCESS_DENIED', message: 'Bạn không có quyền trong phạm vi tổ chức này.' });
  }

  private requiredText(value: string): string {
    if (!value.trim()) throw new BadRequestException({ code: 'EMPTY_ORGANIZATION_VALUE', message: 'Nội dung không được để trống.' });
    return value.trim();
  }

  private async audit(manager: EntityManager, user: AuthenticatedUserView, type: string, id: string, action: string, before: unknown, after: unknown): Promise<void> {
    await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,old_value,new_value,created_by)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`, [type,id,action,before === null ? null : JSON.stringify(before),after === null ? null : JSON.stringify(after),user.id]);
  }

  private async team(manager: EntityManager, id: string, lock = false): Promise<Team> {
    const [team] = await manager.query<Team[]>(`${teamSelect} WHERE t.id=$1 ${lock ? 'FOR UPDATE OF t' : ''}`, [id]);
    if (!team) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Không tìm thấy team.' });
    return team;
  }

  private async grantsFor(userId?: string): Promise<ManagementGrant[]> {
    type Row = Omit<ManagementGrant, 'validFrom' | 'validUntil' | 'createdAt' | 'revokedAt'> & {
      validFrom: Date; validUntil: Date | null; createdAt: Date; revokedAt: Date | null;
    };
    const rows = await this.db.query<Row[]>(`SELECT g.id,g.user_id AS "userId",e.id AS "employeeId",
      e.employee_code AS "employeeCode",e.full_name AS "employeeName",g.role_code AS "roleCode",
      d.id AS "departmentId",d.name AS "departmentName",t.id AS "teamId",t.name AS "teamName",
      g.appointment_type AS "appointmentType",g.valid_from AS "validFrom",g.valid_until AS "validUntil",
      g.reason,g.created_at AS "createdAt",COALESCE(creator_employee.full_name,creator.email) AS "createdByName",
      g.revoked_at AS "revokedAt",COALESCE(revoker_employee.full_name,revoker.email) AS "revokedByName",g.revocation_reason AS "revocationReason",
      (u.is_active AND e.is_active AND d.is_active AND (g.team_id IS NULL OR t.is_active)) AS eligible
      FROM organization_management_grants g
      JOIN users u ON u.id=g.user_id JOIN employees e ON e.user_id=u.id
      LEFT JOIN organization_teams t ON t.id=g.team_id
      JOIN departments d ON d.id=COALESCE(g.department_id,t.department_id)
      JOIN users creator ON creator.id=g.created_by LEFT JOIN users revoker ON revoker.id=g.revoked_by
      LEFT JOIN employees creator_employee ON creator_employee.user_id=creator.id
      LEFT JOIN employees revoker_employee ON revoker_employee.user_id=revoker.id
      ${userId ? 'WHERE g.user_id=$1' : ''} ORDER BY g.created_at DESC,g.id`, userId ? [userId] : []);
    return rows.map((row) => ({ ...row, validFrom: row.validFrom.toISOString(), validUntil: row.validUntil?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null }));
  }

  async listGrants(user: AuthenticatedUserView): Promise<unknown> {
    this.assertAdmin(user);
    const now = new Date();
    return (await this.grantsFor()).map((grant) => ({ ...grant, status: grantStatus(grant, now) }));
  }

  async myAccess(user: AuthenticatedUserView): Promise<unknown> {
    const now = new Date();
    const grants = (await this.grantsFor(user.id)).filter((grant) => grantStatus(grant, now) === 'ACTIVE');
    return { grants: grants.map((grant) => ({ id: grant.id, roleCode: grant.roleCode, departmentId: grant.departmentId,
      departmentName: grant.departmentName, teamId: grant.teamId, teamName: grant.teamName,
      appointmentType: grant.appointmentType, validFrom: grant.validFrom, validUntil: grant.validUntil })),
      capabilities: { manageOrganization: user.roles.includes(RoleCode.Admin), readScopedDirectory: user.roles.includes(RoleCode.Admin) || grants.length > 0,
        reviewWorkflow: 'NOT_IMPLEMENTED' } };
  }

  async listTeams(user: AuthenticatedUserView): Promise<Team[]> {
    if (user.roles.includes(RoleCode.Admin)) return this.db.query<Team[]>(`${teamSelect} ORDER BY d.name,t.name,t.id`);
    const now = new Date();
    const grants = (await this.grantsFor(user.id)).filter((grant) => grantStatus(grant, now) === 'ACTIVE');
    const departments = grants.filter((grant) => grant.roleCode === 'DEPARTMENT_HEAD').map((grant) => grant.departmentId);
    const teams = grants.filter((grant) => grant.roleCode === 'TEAM_LEADER').map((grant) => grant.teamId);
    const rows = await this.db.query<Team[]>(`${teamSelect} WHERE t.is_active AND d.is_active
      AND (t.department_id=ANY($1::uuid[]) OR t.id=ANY($2::uuid[])) ORDER BY d.name,t.name,t.id`, [departments,teams]);
    return rows.filter((team) => grants.some((grant) => grantCoversTeam(grant,team,now)));
  }

  async listMembers(user: AuthenticatedUserView, teamId: string): Promise<unknown> {
    const visible = await this.listTeams(user);
    if (!visible.some((team) => team.id === teamId)) this.denied();
    const admin = user.roles.includes(RoleCode.Admin);
    const rows = await this.db.query<Member[]>(`SELECT m.id,m.employee_id AS "employeeId",e.employee_code AS "employeeCode",
      e.full_name AS "fullName",m.created_at AS "createdAt",m.ended_at AS "endedAt",m.end_reason AS "endReason",
      (e.is_active AND t.is_active AND d.is_active AND EXISTS(SELECT 1 FROM employee_organization_assignments a
        JOIN branches b ON b.id=a.branch_id WHERE a.employee_id=e.id AND a.department_id=t.department_id AND b.is_active AND ${currentAssignment('a')})) AS eligible,
      ARRAY(SELECT DISTINCT b.name FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id
        WHERE a.employee_id=e.id AND a.department_id=t.department_id AND b.is_active AND ${currentAssignment('a')} ORDER BY b.name) AS branches
      FROM organization_team_memberships m JOIN employees e ON e.id=m.employee_id
      JOIN organization_teams t ON t.id=m.team_id JOIN departments d ON d.id=t.department_id
      WHERE m.team_id=$1 ${admin ? '' : 'AND m.ended_at IS NULL'} ORDER BY m.ended_at NULLS FIRST,e.full_name,m.created_at DESC`, [teamId]);
    return rows.filter((row) => admin || row.eligible).map((row) => ({ ...row, status: row.endedAt ? 'ENDED' : row.eligible ? 'ACTIVE' : 'INACTIVE' }));
  }

  async departmentEmployees(user: AuthenticatedUserView, departmentId: string): Promise<EmployeeSummary[]> {
    if (!user.roles.includes(RoleCode.Admin)) {
      const now = new Date();
      const grants = await this.grantsFor(user.id);
      if (!grants.some((grant) => grant.roleCode === 'DEPARTMENT_HEAD' && grant.departmentId === departmentId && grantStatus(grant, now) === 'ACTIVE')) this.denied();
    }
    return this.db.query<EmployeeSummary[]>(`SELECT e.id,e.employee_code AS "employeeCode",e.full_name AS "fullName",array_agg(DISTINCT b.name ORDER BY b.name) AS branches
      FROM employees e JOIN employee_organization_assignments a ON a.employee_id=e.id
      JOIN departments d ON d.id=a.department_id JOIN branches b ON b.id=a.branch_id
      WHERE e.is_active AND d.is_active AND b.is_active AND a.department_id=$1 AND ${currentAssignment('a')}
      GROUP BY e.id ORDER BY e.full_name,e.id`, [departmentId]);
  }

  async createTeam(user: AuthenticatedUserView, input: CreateTeamDto): Promise<Team> {
    this.assertAdmin(user);
    try {
      return await this.db.transaction(async (manager) => {
        const departments = await manager.query<Array<{ id: string }>>('SELECT id FROM departments WHERE id=$1 AND is_active FOR SHARE', [input.departmentId]);
        if (!departments.length) throw new BadRequestException({ code: 'DEPARTMENT_INACTIVE', message: 'Phòng ban không hoạt động hoặc không tồn tại.' });
        const [row] = await manager.query<Array<{ id: string }>>(`INSERT INTO organization_teams(department_id,code,name,created_by)
          VALUES($1,$2,$3,$4) RETURNING id`, [input.departmentId,input.code.toUpperCase(),this.requiredText(input.name),user.id]);
        const created = await this.team(manager,row.id);
        await this.audit(manager,user,'ORGANIZATION_TEAM',row.id,'CREATE',null,created);
        return created;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException({ code: 'TEAM_CODE_EXISTS', message: 'Mã team đã tồn tại trong phòng ban.' });
      throw error;
    }
  }

  async updateTeam(user: AuthenticatedUserView, id: string, input: UpdateTeamDto): Promise<Team> {
    this.assertAdmin(user);
    return this.db.transaction(async (manager) => {
      const before = await this.team(manager,id,true);
      if (input.isActive && !before.departmentActive) throw new BadRequestException({ code: 'DEPARTMENT_INACTIVE', message: 'Phòng ban không hoạt động.' });
      await manager.query('UPDATE organization_teams SET name=$2,is_active=$3 WHERE id=$1', [id,this.requiredText(input.name),input.isActive]);
      const after = await this.team(manager,id);
      await this.audit(manager,user,'ORGANIZATION_TEAM',id,'UPDATE',before,after);
      return after;
    });
  }

  async addMember(user: AuthenticatedUserView, teamId: string, employeeId: string): Promise<unknown> {
    this.assertAdmin(user);
    return this.db.transaction(async (manager) => {
      const team = await this.team(manager,teamId,true);
      if (!team.isActive || !team.departmentActive) throw new BadRequestException({ code: 'TEAM_INACTIVE', message: 'Team hoặc phòng ban không hoạt động.' });
      const rows = await manager.query<Array<{ id: string }>>(`SELECT e.id FROM employees e WHERE e.id=$1 AND e.is_active
        AND EXISTS(SELECT 1 FROM employee_organization_assignments a JOIN branches b ON b.id=a.branch_id
          WHERE a.employee_id=e.id AND a.department_id=$2 AND b.is_active AND ${currentAssignment('a')}) FOR SHARE OF e`, [employeeId,team.departmentId]);
      if (!rows.length) throw new BadRequestException({ code: 'EMPLOYEE_OUTSIDE_DEPARTMENT', message: 'Nhân viên phải đang hoạt động và thuộc phòng ban của team.' });
      const [member] = await manager.query<Array<{ id: string }>>(`INSERT INTO organization_team_memberships(team_id,employee_id,created_by)
        VALUES($1,$2,$3) ON CONFLICT(team_id,employee_id) WHERE ended_at IS NULL DO NOTHING RETURNING id`, [teamId,employeeId,user.id]);
      if (!member) throw new ConflictException({ code: 'TEAM_MEMBER_EXISTS', message: 'Nhân viên đã có trong team. Không tạo thêm bản ghi trùng.' });
      await this.audit(manager,user,'TEAM_MEMBERSHIP',member.id,'ADD',null,{ teamId,employeeId });
      return { id: member.id };
    });
  }

  async endMembership(user: AuthenticatedUserView, teamId: string, membershipId: string, reason: string): Promise<unknown> {
    this.assertAdmin(user);
    return this.db.transaction(async (manager) => {
      await this.team(manager,teamId,true);
      const [before] = await manager.query<Array<{ id: string; employeeId: string; endedAt: Date | null }>>(`SELECT id,employee_id AS "employeeId",ended_at AS "endedAt"
        FROM organization_team_memberships WHERE id=$1 AND team_id=$2 FOR UPDATE`, [membershipId,teamId]);
      if (!before) throw new NotFoundException({ code: 'MEMBERSHIP_NOT_FOUND', message: 'Không tìm thấy phân công team.' });
      if (before.endedAt) throw new ConflictException({ code: 'MEMBERSHIP_ALREADY_ENDED', message: 'Phân công đã kết thúc.' });
      const text = this.requiredText(reason);
      await manager.query('UPDATE organization_team_memberships SET ended_at=now(),ended_by=$2,end_reason=$3 WHERE id=$1', [membershipId,user.id,text]);
      await this.audit(manager,user,'TEAM_MEMBERSHIP',membershipId,'END',before,{ teamId,employeeId: before.employeeId,reason: text });
      return { id: membershipId };
    });
  }

  async createGrant(user: AuthenticatedUserView, input: CreateManagementGrantDto): Promise<unknown> {
    this.assertAdmin(user);
    if (!validGrantWindow(input.validFrom,input.validUntil)) throw new BadRequestException({ code: 'INVALID_GRANT_WINDOW', message: 'Thời hạn quyền phải có múi giờ và thời điểm kết thúc phải sau bắt đầu.' });
    const department = input.roleCode === 'DEPARTMENT_HEAD';
    if (department ? !input.departmentId || !!input.teamId : !input.teamId || !!input.departmentId) {
      throw new BadRequestException({ code: 'INVALID_MANAGEMENT_SCOPE', message: 'Trưởng phòng cần phạm vi phòng ban; Leader cần phạm vi team.' });
    }
    return this.db.transaction(async (manager) => {
      // Serialize overlapping grant checks per account without provisioning a global role.
      const [account] = await manager.query<Array<{ userId: string }>>(`SELECT u.id AS "userId" FROM users u JOIN employees e ON e.user_id=u.id
        WHERE e.id=$1 AND e.is_active AND u.is_active FOR UPDATE OF u`, [input.employeeId]);
      if (!account) throw new BadRequestException({ code: 'MANAGER_ACCOUNT_REQUIRED', message: 'Người quản lý cần hồ sơ và tài khoản đang hoạt động.' });
      if (department) {
        const rows = await manager.query<Array<{ id: string }>>('SELECT id FROM departments WHERE id=$1 AND is_active FOR SHARE', [input.departmentId]);
        if (!rows.length) throw new BadRequestException({ code: 'DEPARTMENT_INACTIVE', message: 'Phòng ban không hoạt động hoặc không tồn tại.' });
      } else {
        const team = await this.team(manager,input.teamId!,true);
        if (!team.isActive || !team.departmentActive) throw new BadRequestException({ code: 'TEAM_INACTIVE', message: 'Team hoặc phòng ban không hoạt động.' });
      }
      const overlaps = await manager.query<Array<{ id: string }>>(`SELECT id FROM organization_management_grants
        WHERE user_id=$1 AND role_code=$2 AND department_id IS NOT DISTINCT FROM $3::uuid AND team_id IS NOT DISTINCT FROM $4::uuid
        AND revoked_at IS NULL AND tstzrange(valid_from,valid_until,'[)') && tstzrange($5::timestamptz,$6::timestamptz,'[)')`,
        [account.userId,input.roleCode,input.departmentId ?? null,input.teamId ?? null,input.validFrom,input.validUntil ?? null]);
      if (overlaps.length) throw new ConflictException({ code: 'MANAGEMENT_GRANT_OVERLAP', message: 'Quyền cùng vai trò/phạm vi bị trùng thời hạn. Hãy thu hồi quyền cũ trước khi cấp lại.' });
      const [row] = await manager.query<Array<{ id: string }>>(`INSERT INTO organization_management_grants
        (user_id,role_code,department_id,team_id,appointment_type,valid_from,valid_until,reason,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [account.userId,input.roleCode,input.departmentId ?? null,input.teamId ?? null,input.appointmentType,input.validFrom,input.validUntil ?? null,this.requiredText(input.reason),user.id]);
      await this.audit(manager,user,'MANAGEMENT_GRANT',row.id,'GRANT',null,{ ...input,userId: account.userId });
      return { id: row.id };
    });
  }

  async revokeGrant(user: AuthenticatedUserView, id: string, reason: string): Promise<unknown> {
    this.assertAdmin(user);
    return this.db.transaction(async (manager) => {
      const [before] = await manager.query<Array<{ id: string; revoked_at: Date | null }>>('SELECT * FROM organization_management_grants WHERE id=$1 FOR UPDATE', [id]);
      if (!before) throw new NotFoundException({ code: 'MANAGEMENT_GRANT_NOT_FOUND', message: 'Không tìm thấy quyền quản lý.' });
      if (before.revoked_at) throw new ConflictException({ code: 'MANAGEMENT_GRANT_REVOKED', message: 'Quyền đã được thu hồi.' });
      const text = this.requiredText(reason);
      await manager.query('UPDATE organization_management_grants SET revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE id=$1', [id,user.id,text]);
      await this.audit(manager,user,'MANAGEMENT_GRANT',id,'REVOKE',before,{ reason: text });
      return { id };
    });
  }

  async history(user: AuthenticatedUserView): Promise<unknown> {
    this.assertAdmin(user);
    return this.db.query(`SELECT a.id,a.resource_type AS "resourceType",a.resource_id AS "resourceId",a.action,
      a.old_value AS "oldValue",a.new_value AS "newValue",a.created_at AS "createdAt",COALESCE(e.full_name,u.email) AS "actorName"
      FROM configuration_audit_logs a JOIN users u ON u.id=a.created_by
      LEFT JOIN employees e ON e.user_id=u.id
      WHERE a.resource_type IN ('ORGANIZATION_TEAM','TEAM_MEMBERSHIP','MANAGEMENT_GRANT') ORDER BY a.created_at DESC,a.id DESC LIMIT 200`);
  }

}
