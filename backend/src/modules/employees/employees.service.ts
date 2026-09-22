import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { DepartmentEntity } from '../../database/entities/department.entity.js';
import { EmployeeEntity } from '../../database/entities/employee.entity.js';
import {
  BranchEntity,
  EmployeeOrganizationAssignmentEntity,
  UserBranchScopeEntity,
} from '../../database/entities/organization.entity.js';
import { PositionEntity } from '../../database/entities/position.entity.js';
import { RoleEntity } from '../../database/entities/role.entity.js';
import { UserRoleEntity } from '../../database/entities/user-role.entity.js';
import { UserEntity } from '../../database/entities/user.entity.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../auth/application/auth.ports.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import type {
  CreateEmployeeDto,
  CreateLookupDto,
  OrganizationAssignmentDto,
  UpdateEmployeeDto,
} from './employees.dto.js';

interface AssignmentRow {
  id: string;
  employeeId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  positionId: string | null;
  positionCode: string | null;
  positionName: string | null;
  managerEmployeeId: string | null;
  managerName: string | null;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(EmployeeEntity)
    private readonly employees: Repository<EmployeeEntity>,
    @InjectRepository(DepartmentEntity)
    private readonly departments: Repository<DepartmentEntity>,
    @InjectRepository(PositionEntity)
    private readonly positions: Repository<PositionEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async list(user: AuthenticatedUserView, search?: string): Promise<unknown[]> {
    let employees = await this.employees.find({
      where: search
        ? [
            { fullName: ILike(`%${search}%`) },
            { employeeCode: ILike(`%${search}%`) },
          ]
        : undefined,
      relations: { department: true, position: true, user: true },
      order: { fullName: 'ASC' },
    });

    const hasGlobalAccess = user.roles.some((role) =>
      [RoleCode.Admin, RoleCode.ChiefAccountant].includes(role),
    );
    if (!hasGlobalAccess) {
      const allowedRows = await this.dataSource.query<
        Array<{ employeeId: string }>
      >(
        `SELECT DISTINCT a.employee_id AS "employeeId"
         FROM user_branch_scopes s
         JOIN employee_organization_assignments a ON a.branch_id = s.branch_id
         WHERE s.user_id = $1 AND a.effective_to IS NULL`,
        [user.id],
      );
      const allowedIds = new Set(allowedRows.map((row) => row.employeeId));
      employees = employees.filter((employee) => allowedIds.has(employee.id));
    }

    if (employees.length === 0) return [];
    const ids = employees.map((employee) => employee.id);
    const assignments = await this.dataSource.query<AssignmentRow[]>(
      `SELECT a.id, a.employee_id AS "employeeId", a.branch_id AS "branchId",
        b.code AS "branchCode", b.name AS "branchName",
        a.department_id AS "departmentId", d.code AS "departmentCode", d.name AS "departmentName",
        a.position_id AS "positionId", p.code AS "positionCode", p.name AS "positionName",
        a.manager_employee_id AS "managerEmployeeId", manager.full_name AS "managerName",
        a.is_primary AS "isPrimary", a.effective_from::text AS "effectiveFrom",
        a.effective_to::text AS "effectiveTo"
       FROM employee_organization_assignments a
       JOIN branches b ON b.id = a.branch_id
       JOIN departments d ON d.id = a.department_id
       LEFT JOIN positions p ON p.id = a.position_id
       LEFT JOIN employees manager ON manager.id = a.manager_employee_id
       WHERE a.employee_id = ANY($1::uuid[]) AND a.effective_to IS NULL
       ORDER BY a.is_primary DESC, b.name, d.name`,
      [ids],
    );
    const accountRows = await this.dataSource.query<
      Array<{ employeeId: string; roles: string[]; scopeBranchIds: string[] }>
    >(
      `SELECT e.id AS "employeeId",
        COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
        COALESCE(array_agg(DISTINCT s.branch_id::text) FILTER (WHERE s.branch_id IS NOT NULL), '{}') AS "scopeBranchIds"
       FROM employees e
       LEFT JOIN user_roles ur ON ur.user_id = e.user_id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_branch_scopes s ON s.user_id = e.user_id
       WHERE e.id = ANY($1::uuid[])
       GROUP BY e.id`,
      [ids],
    );
    const accountByEmployee = new Map(
      accountRows.map((row) => [row.employeeId, row]),
    );

    return employees.map(({ user: account, ...employee }) => ({
      ...employee,
      accountEmail: account?.email ?? null,
      accountRoles: accountByEmployee.get(employee.id)?.roles ?? [],
      scopeBranchIds:
        accountByEmployee.get(employee.id)?.scopeBranchIds ?? [],
      organizationAssignments: assignments.filter(
        (assignment) => assignment.employeeId === employee.id,
      ),
    }));
  }

  async create(input: CreateEmployeeDto): Promise<EmployeeEntity> {
    this.validateAssignments(input.organizationAssignments);
    if (
      (input.email && !input.temporaryPassword) ||
      (!input.email && input.temporaryPassword)
    ) {
      throw new BadRequestException({
        code: 'ACCOUNT_FIELDS_INCOMPLETE',
        message: 'Email và mật khẩu tạm phải được nhập cùng nhau.',
      });
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        let userId: string | null = null;
        if (input.email && input.temporaryPassword) {
          const user = await manager.getRepository(UserEntity).save(
            manager.getRepository(UserEntity).create({
              email: input.email.trim().toLowerCase(),
              passwordHash: await this.passwordHasher.hash(
                input.temporaryPassword,
              ),
              isActive: true,
            }),
          );
          const roleCode = input.role ?? RoleCode.Employee;
          const role = await manager
            .getRepository(RoleEntity)
            .findOne({ where: { code: roleCode } });
          if (!role) {
            throw new BadRequestException({
              code: 'ROLE_NOT_FOUND',
              message: 'Vai trò không hợp lệ.',
            });
          }
          await manager
            .getRepository(UserRoleEntity)
            .save({ userId: user.id, roleId: role.id });
          userId = user.id;
        }

        const primary = input.organizationAssignments.find(
          (assignment) => assignment.isPrimary,
        )!;
        const employee = await manager.getRepository(EmployeeEntity).save(
          manager.getRepository(EmployeeEntity).create({
            employeeCode: input.employeeCode.trim().toUpperCase(),
            fullName: input.fullName.trim(),
            employeeType: input.employeeType,
            phone: input.phone || null,
            hireDate: input.hireDate || null,
            departmentId: primary.departmentId,
            positionId: primary.positionId || null,
            userId,
            isActive: true,
          }),
        );
        await this.saveAssignments(
          manager,
          employee.id,
          input.organizationAssignments,
          input.hireDate,
        );
        if (userId) {
          await this.replaceBranchScopes(
            manager,
            userId,
            input.scopeBranchIds ??
              (input.role === RoleCode.AreaManager
                ? input.organizationAssignments.map(
                    (assignment) => assignment.branchId,
                  )
                : []),
          );
        }
        return employee;
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ConflictException({
        code: 'EMPLOYEE_CONFLICT',
        message:
          'Mã nhân viên, email hoặc phân công tổ chức đã tồn tại/không hợp lệ.',
      });
    }
  }

  async update(id: string, input: UpdateEmployeeDto): Promise<EmployeeEntity> {
    if (input.organizationAssignments) {
      this.validateAssignments(input.organizationAssignments);
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmployeeEntity);
      const employee = await repository.findOne({ where: { id } });
      if (!employee) {
        throw new NotFoundException({
          code: 'EMPLOYEE_NOT_FOUND',
          message: 'Không tìm thấy nhân viên.',
        });
      }

      const { organizationAssignments, scopeBranchIds, ...profile } = input;
      Object.assign(employee, profile);
      if (organizationAssignments) {
        const primary = organizationAssignments.find(
          (assignment) => assignment.isPrimary,
        )!;
        employee.departmentId = primary.departmentId;
        employee.positionId = primary.positionId ?? null;
        const today = this.today();
        await manager.query(
          `UPDATE employee_organization_assignments
           SET effective_to = CASE WHEN effective_from < $2::date THEN ($2::date - INTERVAL '1 day')::date ELSE effective_from END,
               updated_at = now()
           WHERE employee_id = $1 AND effective_to IS NULL`,
          [id, today],
        );
        await this.saveAssignments(
          manager,
          id,
          organizationAssignments,
          today,
        );
      }
      const saved = await repository.save(employee);

      if (employee.userId && scopeBranchIds) {
        await this.replaceBranchScopes(manager, employee.userId, scopeBranchIds);
      }
      if (employee.userId && input.isActive === false) {
        await manager
          .getRepository(UserEntity)
          .update(employee.userId, { isActive: false });
      }
      return saved;
    });
  }

  listDepartments(): Promise<DepartmentEntity[]> {
    return this.departments.find({ order: { name: 'ASC' } });
  }

  listPositions(): Promise<PositionEntity[]> {
    return this.positions.find({ order: { name: 'ASC' } });
  }

  listBranches(): Promise<BranchEntity[]> {
    return this.branches.find({ order: { name: 'ASC' } });
  }

  async createDepartment(input: CreateLookupDto): Promise<DepartmentEntity> {
    return this.departments.save(
      this.departments.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        isActive: true,
      }),
    );
  }

  async createPosition(input: CreateLookupDto): Promise<PositionEntity> {
    return this.positions.save(
      this.positions.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        isActive: true,
      }),
    );
  }

  async createBranch(input: CreateLookupDto): Promise<BranchEntity> {
    return this.branches.save(
      this.branches.create({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        isActive: true,
      }),
    );
  }

  private validateAssignments(assignments: OrganizationAssignmentDto[]): void {
    if (assignments.filter((assignment) => assignment.isPrimary).length !== 1) {
      throw new BadRequestException({
        code: 'PRIMARY_ASSIGNMENT_REQUIRED',
        message: 'Phải có đúng một phân công tổ chức chính.',
      });
    }
    const keys = assignments.map(
      (assignment) => `${assignment.branchId}:${assignment.departmentId}`,
    );
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_ORGANIZATION_ASSIGNMENT',
        message: 'Không thể phân công trùng chi nhánh và phòng ban.',
      });
    }
  }

  private async saveAssignments(
    manager: EntityManager,
    employeeId: string,
    assignments: OrganizationAssignmentDto[],
    effectiveFrom?: string,
  ): Promise<void> {
    const repository = manager.getRepository(
      EmployeeOrganizationAssignmentEntity,
    );
    await repository.save(
      assignments.map((assignment) =>
        repository.create({
          ...assignment,
          employeeId,
          positionId: assignment.positionId ?? null,
          managerEmployeeId: assignment.managerEmployeeId ?? null,
          effectiveFrom: effectiveFrom ?? this.today(),
          effectiveTo: null,
        }),
      ),
    );
  }

  private async replaceBranchScopes(
    manager: EntityManager,
    userId: string,
    branchIds: string[],
  ): Promise<void> {
    const repository = manager.getRepository(UserBranchScopeEntity);
    await repository.delete({ userId });
    const uniqueBranchIds = [...new Set(branchIds)];
    if (uniqueBranchIds.length > 0) {
      await repository.save(
        uniqueBranchIds.map((branchId) =>
          repository.create({ userId, branchId }),
        ),
      );
    }
  }

  private today(): string {
    return new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Bangkok',
    });
  }
}
