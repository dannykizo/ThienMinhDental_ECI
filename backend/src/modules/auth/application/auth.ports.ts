import type { RoleCode } from '../domain/role-code.js';
import type { UserAccount } from '../domain/user-account.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: RoleCode[];
}

export interface UserAuthenticationRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  findById(id: string): Promise<UserAccount | null>;
}

export interface PasswordHasher {
  hash(value: string): Promise<string>;
  compare(value: string, hash: string): Promise<boolean>;
}

export interface AccessTokenService {
  sign(payload: AccessTokenPayload): Promise<string>;
  verify(token: string): Promise<AccessTokenPayload>;
}

export const USER_AUTHENTICATION_REPOSITORY = Symbol(
  'USER_AUTHENTICATION_REPOSITORY',
);
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const ACCESS_TOKEN_SERVICE = Symbol('ACCESS_TOKEN_SERVICE');
