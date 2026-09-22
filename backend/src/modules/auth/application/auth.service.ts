import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RoleCode } from '../domain/role-code.js';
import type { UserAccount } from '../domain/user-account.js';
import {
  ACCESS_TOKEN_SERVICE,
  PASSWORD_HASHER,
  USER_AUTHENTICATION_REPOSITORY,
  type AccessTokenService,
  type PasswordHasher,
  type UserAuthenticationRepository,
} from './auth.ports.js';

export interface AuthenticatedUserView {
  id: string;
  email: string;
  employeeId: string | null;
  displayName: string;
  roles: RoleCode[];
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUserView;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_AUTHENTICATION_REPOSITORY)
    private readonly users: UserAuthenticationRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokens: AccessTokenService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);

    if (
      !user ||
      !user.isActive ||
      !(await this.passwordHasher.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Tài khoản hoặc mật khẩu không đúng.',
      });
    }

    const accessToken = await this.accessTokens.sign({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    });

    return { accessToken, user: this.toView(user) };
  }

  async getActiveUser(id: string): Promise<AuthenticatedUserView> {
    const user = await this.users.findById(id);

    if (!user?.isActive) {
      throw new UnauthorizedException({
        code: 'SESSION_USER_UNAVAILABLE',
        message: 'Phiên đăng nhập không còn hợp lệ.',
      });
    }

    return this.toView(user);
  }

  private toView(user: UserAccount): AuthenticatedUserView {
    return {
      id: user.id,
      email: user.email,
      employeeId: user.employeeId,
      displayName: user.displayName,
      roles: [...user.roles],
    };
  }
}
