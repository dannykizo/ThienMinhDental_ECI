import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from '../../database/entities/employee.entity.js';
import { RoleEntity } from '../../database/entities/role.entity.js';
import { UserRoleEntity } from '../../database/entities/user-role.entity.js';
import { UserEntity } from '../../database/entities/user.entity.js';
import {
  ACCESS_TOKEN_SERVICE,
  PASSWORD_HASHER,
  USER_AUTHENTICATION_REPOSITORY,
} from './application/auth.ports.js';
import { AuthService } from './application/auth.service.js';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher.js';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service.js';
import { TypeOrmUserAuthenticationRepository } from './infrastructure/typeorm-user-authentication.repository.js';
import { AuthController } from './presentation/auth.controller.js';
import { JwtAuthGuard } from './presentation/jwt-auth.guard.js';
import { RolesGuard } from './presentation/roles.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      EmployeeEntity,
      RoleEntity,
      UserRoleEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = Number(
          config.get<string>('JWT_EXPIRES_IN_SECONDS', '28800'),
        );
        if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
          throw new Error('JWT_EXPIRES_IN_SECONDS must be a positive number');
        }

        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: USER_AUTHENTICATION_REPOSITORY,
      useClass: TypeOrmUserAuthenticationRepository,
    },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JwtAccessTokenService },
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    ACCESS_TOKEN_SERVICE,
    PASSWORD_HASHER,
  ],
})
export class AuthModule {}
