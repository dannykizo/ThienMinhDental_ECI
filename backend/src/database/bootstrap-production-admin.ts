import 'reflect-metadata';
import { hash } from 'bcryptjs';
import { applicationDataSource } from './data-source.js';
import { RoleEntity } from './entities/role.entity.js';
import { UserRoleEntity } from './entities/user-role.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { RoleCode } from '../modules/auth/domain/role-code.js';

function requiredEnvironment(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function validatePassword(password: string): void {
  const isStrong =
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (!isStrong) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be 12-128 characters and include uppercase, lowercase, number and symbol',
    );
  }
}

async function bootstrapProductionAdmin(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('PRODUCTION_ADMIN_BOOTSTRAP_REFUSED_OUTSIDE_PRODUCTION');
  }

  const email = requiredEnvironment('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = requiredEnvironment('BOOTSTRAP_ADMIN_PASSWORD');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  }
  validatePassword(password);

  await applicationDataSource.initialize();
  try {
    await applicationDataSource.transaction(async (manager) => {
      const existingAdmin = await manager
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .innerJoin('user.userRoles', 'userRole')
        .innerJoin('userRole.role', 'role', 'role.code = :roleCode', {
          roleCode: RoleCode.Admin,
        })
        .getOne();
      if (existingAdmin) {
        throw new Error('PRODUCTION_ADMIN_ALREADY_EXISTS');
      }

      const users = manager.getRepository(UserEntity);
      if (await users.findOne({ where: { email } })) {
        throw new Error('BOOTSTRAP_ADMIN_EMAIL_ALREADY_EXISTS');
      }

      const adminRole = await manager
        .getRepository(RoleEntity)
        .findOne({ where: { code: RoleCode.Admin } });
      if (!adminRole) {
        throw new Error('ADMIN_ROLE_NOT_FOUND_RUN_MIGRATIONS_FIRST');
      }

      const user = await users.save(
        users.create({
          email,
          passwordHash: await hash(password, 12),
          isActive: true,
        }),
      );
      await manager.getRepository(UserRoleEntity).save({
        userId: user.id,
        roleId: adminRole.id,
      });
    });
  } finally {
    await applicationDataSource.destroy();
  }

  console.log(`Production administrator created: ${email}`);
}

void bootstrapProductionAdmin();
