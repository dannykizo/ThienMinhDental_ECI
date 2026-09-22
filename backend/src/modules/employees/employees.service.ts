import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { DepartmentEntity } from '../../database/entities/department.entity.js';
import { EmployeeEntity } from '../../database/entities/employee.entity.js';
import { PositionEntity } from '../../database/entities/position.entity.js';
import { RoleEntity } from '../../database/entities/role.entity.js';
import { UserRoleEntity } from '../../database/entities/user-role.entity.js';
import { UserEntity } from '../../database/entities/user.entity.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../auth/application/auth.ports.js';
import type {
  CreateEmployeeDto,
  CreateLookupDto,
  UpdateEmployeeDto,
} from './employees.dto.js';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(EmployeeEntity) private readonly employees: Repository<EmployeeEntity>,
    @InjectRepository(DepartmentEntity) private readonly departments: Repository<DepartmentEntity>,
    @InjectRepository(PositionEntity) private readonly positions: Repository<PositionEntity>,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async list(search?: string): Promise<unknown[]> {
    const employees = await this.employees.find({
      where: search
        ? [{ fullName: ILike(`%${search}%`) }, { employeeCode: ILike(`%${search}%`) }]
        : undefined,
      relations: { department: true, position: true, user: true },
      order: { fullName: 'ASC' },
    });
    return employees.map(({ user, ...employee }) => ({
      ...employee,
      accountEmail: user?.email ?? null,
    }));
  }

  async create(input: CreateEmployeeDto): Promise<EmployeeEntity> {
    if ((input.email && !input.temporaryPassword) || (!input.email && input.temporaryPassword)) {
      throw new BadRequestException({ code: 'ACCOUNT_FIELDS_INCOMPLETE', message: 'Email và mật khẩu tạm phải được nhập cùng nhau.' });
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        let userId: string | null = null;
        if (input.email && input.temporaryPassword) {
          const user = await manager.getRepository(UserEntity).save(
            manager.getRepository(UserEntity).create({
              email: input.email.trim().toLowerCase(),
              passwordHash: await this.passwordHasher.hash(input.temporaryPassword),
              isActive: true,
            }),
          );
          const role = await manager.getRepository(RoleEntity).findOne({ where: { code: input.role ?? 'EMPLOYEE' } });
          if (!role) throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'Vai trò không hợp lệ.' });
          await manager.getRepository(UserRoleEntity).save({ userId: user.id, roleId: role.id });
          userId = user.id;
        }

        const employee = manager.getRepository(EmployeeEntity).create({
          employeeCode: input.employeeCode.trim().toUpperCase(),
          fullName: input.fullName.trim(),
          employeeType: input.employeeType,
          phone: input.phone || null,
          hireDate: input.hireDate || null,
          departmentId: input.departmentId || null,
          positionId: input.positionId || null,
          userId,
          isActive: true,
        });
        return manager.getRepository(EmployeeEntity).save(employee);
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ConflictException({ code: 'EMPLOYEE_CONFLICT', message: 'Mã nhân viên hoặc email đã tồn tại.' });
    }
  }

  async update(id: string, input: UpdateEmployeeDto): Promise<EmployeeEntity> {
    const employee = await this.employees.findOne({ where: { id } });
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy nhân viên.' });
    Object.assign(employee, input);
    return this.employees.save(employee);
  }

  listDepartments(): Promise<DepartmentEntity[]> {
    return this.departments.find({ order: { name: 'ASC' } });
  }

  listPositions(): Promise<PositionEntity[]> {
    return this.positions.find({ order: { name: 'ASC' } });
  }

  async createDepartment(input: CreateLookupDto): Promise<DepartmentEntity> {
    return this.departments.save(this.departments.create({ ...input, code: input.code.toUpperCase(), isActive: true }));
  }

  async createPosition(input: CreateLookupDto): Promise<PositionEntity> {
    return this.positions.save(this.positions.create({ ...input, code: input.code.toUpperCase(), isActive: true }));
  }
}
