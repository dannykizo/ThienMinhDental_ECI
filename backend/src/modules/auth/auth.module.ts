import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from '../../database/entities/employee.entity.js';
import { RoleEntity } from '../../database/entities/role.entity.js';
import { UserRoleEntity } from '../../database/entities/user-role.entity.js';
import { UserEntity } from '../../database/entities/user.entity.js';
import { AuthSessionEntity } from '../../database/entities/auth-session.entity.js';
import {
  ACCESS_TOKEN_SERVICE,
  AUTH_SESSION_REPOSITORY,
  LOGIN_ALERT_SENDER,
  PASSWORD_HASHER,
  USER_AUTHENTICATION_REPOSITORY,
} from './application/auth.ports.js';
import { AuthService } from './application/auth.service.js';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher.js';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service.js';
import { TypeOrmUserAuthenticationRepository } from './infrastructure/typeorm-user-authentication.repository.js';
import { TypeOrmAuthSessionRepository } from './infrastructure/typeorm-auth-session.repository.js';
import { SmtpLoginAlertSender } from './infrastructure/smtp-login-alert.sender.js';
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
      AuthSessionEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const sessionDays = Number(
          config.get<string>('AUTH_SESSION_DAYS', '30'),
        );
        if (!Number.isFinite(sessionDays) || sessionDays <= 0) {
          throw new Error('AUTH_SESSION_DAYS must be a positive number');
        }

        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: { expiresIn: sessionDays * 24 * 60 * 60 },
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
    {
      provide: AUTH_SESSION_REPOSITORY,
      useClass: TypeOrmAuthSessionRepository,
    },
    { provide: LOGIN_ALERT_SENDER, useClass: SmtpLoginAlertSender },
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
