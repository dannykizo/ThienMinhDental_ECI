import { hash } from 'bcryptjs';
import { applicationDataSource } from './data-source.js';
import { DepartmentEntity } from './entities/department.entity.js';
import { EmployeeEntity } from './entities/employee.entity.js';
import { PositionEntity } from './entities/position.entity.js';
import { RoleEntity } from './entities/role.entity.js';
import { UserRoleEntity } from './entities/user-role.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { RoleCode } from '../modules/auth/domain/role-code.js';

const roleNames: Record<RoleCode, string> = {
  [RoleCode.Admin]: 'Quản trị viên',
  [RoleCode.Manager]: 'Quản lý chi nhánh',
  [RoleCode.Employee]: 'Nhân viên',
};

async function seedDevelopment(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('DEVELOPMENT_SEED_REFUSED_OUTSIDE_DEVELOPMENT');
  }

  const email = process.env.DEMO_ADMIN_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD are required');
  }

  await applicationDataSource.initialize();
  await applicationDataSource.transaction(async (manager) => {
    const roleRepository = manager.getRepository(RoleEntity);
    const roles = new Map<RoleCode, RoleEntity>();
    for (const code of Object.values(RoleCode)) {
      let role = await roleRepository.findOne({ where: { code } });
      role ??= roleRepository.create({ code, name: roleNames[code] });
      role.name = roleNames[code];
      roles.set(code, await roleRepository.save(role));
    }

    const departmentRepository = manager.getRepository(DepartmentEntity);
    let department = await departmentRepository.findOne({
      where: { code: 'DEV-ADMIN' },
    });
    department ??= departmentRepository.create({ code: 'DEV-ADMIN' });
    department.name = 'Dữ liệu quản trị demo (Development Only)';
    department.isActive = true;
    department = await departmentRepository.save(department);

    const positionRepository = manager.getRepository(PositionEntity);
    let position = await positionRepository.findOne({
      where: { code: 'DEV-ADMIN' },
    });
    position ??= positionRepository.create({ code: 'DEV-ADMIN' });
    position.name = 'Quản trị demo (Development Only)';
    position.isActive = true;
    position = await positionRepository.save(position);

    const userRepository = manager.getRepository(UserEntity);
    let user = await userRepository.findOne({ where: { email } });
    user ??= userRepository.create({ email });
    user.email = email.trim().toLowerCase();
    user.passwordHash = await hash(password, 12);
    user.isActive = true;
    user = await userRepository.save(user);

    const employeeRepository = manager.getRepository(EmployeeEntity);
    let employee = await employeeRepository.findOne({
      where: { employeeCode: 'DEV-ADMIN' },
    });
    employee ??= employeeRepository.create({ employeeCode: 'DEV-ADMIN' });
    employee.fullName = 'Quản trị viên Demo (Development Only)';
    employee.isActive = true;
    employee.departmentId = department.id;
    employee.positionId = position.id;
    employee.userId = user.id;
    await employeeRepository.save(employee);

    const adminRole = roles.get(RoleCode.Admin);
    if (!adminRole) {
      throw new Error('ADMIN_ROLE_SEED_FAILED');
    }
    await manager.getRepository(UserRoleEntity).upsert(
      { userId: user.id, roleId: adminRole.id },
      ['userId', 'roleId'],
    );

    const employeeEmail = (process.env.DEMO_EMPLOYEE_EMAIL ?? 'employee@demo.thienminh.local').trim().toLowerCase();
    const employeePassword = process.env.DEMO_EMPLOYEE_PASSWORD ?? 'EmployeeDemo@2026';
    let employeeDepartment = await departmentRepository.findOne({ where: { code: 'DEV-WORKFORCE' } });
    employeeDepartment ??= departmentRepository.create({ code: 'DEV-WORKFORCE' });
    employeeDepartment.name = 'Nhân sự demo (Development Only)';
    employeeDepartment.isActive = true;
    employeeDepartment = await departmentRepository.save(employeeDepartment);

    let employeePosition = await positionRepository.findOne({ where: { code: 'DEV-EMPLOYEE' } });
    employeePosition ??= positionRepository.create({ code: 'DEV-EMPLOYEE' });
    employeePosition.name = 'Nhân viên demo (Development Only)';
    employeePosition.isActive = true;
    employeePosition = await positionRepository.save(employeePosition);

    let employeeUser = await userRepository.findOne({ where: { email: employeeEmail } });
    employeeUser ??= userRepository.create({ email: employeeEmail });
    employeeUser.passwordHash = await hash(employeePassword, 12);
    employeeUser.isActive = true;
    employeeUser = await userRepository.save(employeeUser);

    let mobileEmployee = await employeeRepository.findOne({ where: { employeeCode: 'DEV-EMPLOYEE' } });
    mobileEmployee ??= employeeRepository.create({ employeeCode: 'DEV-EMPLOYEE' });
    mobileEmployee.fullName = 'Nhân viên Demo (Development Only)';
    mobileEmployee.employeeType = 'OFFICE';
    mobileEmployee.isActive = true;
    mobileEmployee.departmentId = employeeDepartment.id;
    mobileEmployee.positionId = employeePosition.id;
    mobileEmployee.userId = employeeUser.id;
    await employeeRepository.save(mobileEmployee);

    const employeeRole = roles.get(RoleCode.Employee);
    if (!employeeRole) throw new Error('EMPLOYEE_ROLE_SEED_FAILED');
    await manager.getRepository(UserRoleEntity).upsert(
      { userId: employeeUser.id, roleId: employeeRole.id },
      ['userId', 'roleId'],
    );
  });

  await applicationDataSource.destroy();
  console.log(`Development-only accounts seeded: ${email}, ${process.env.DEMO_EMPLOYEE_EMAIL ?? 'employee@demo.thienminh.local'}`);
}

void seedDevelopment();
