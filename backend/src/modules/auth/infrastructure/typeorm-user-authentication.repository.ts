import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../database/entities/user.entity.js';
import type { UserAuthenticationRepository } from '../application/auth.ports.js';
import { RoleCode } from '../domain/role-code.js';
import { UserAccount } from '../domain/user-account.js';

@Injectable()
export class TypeOrmUserAuthenticationRepository
  implements UserAuthenticationRepository
{
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findByEmail(email: string): Promise<UserAccount | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { employee: true, userRoles: { role: true } },
    });

    return user ? this.toDomain(user) : null;
  }

  async findById(id: string): Promise<UserAccount | null> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { employee: true, userRoles: { role: true } },
    });

    return user ? this.toDomain(user) : null;
  }

  private toDomain(user: UserEntity): UserAccount {
    const roles = user.userRoles
      .map((userRole) => userRole.role.code)
      .filter((code): code is RoleCode =>
        Object.values(RoleCode).includes(code as RoleCode),
      );

    return new UserAccount({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      isActive: user.isActive,
      employeeId: user.employee?.id ?? null,
      displayName: user.employee?.fullName ?? user.email,
      roles,
    });
  }
}
