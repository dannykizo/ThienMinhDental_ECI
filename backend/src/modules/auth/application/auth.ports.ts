import type { RoleCode } from '../domain/role-code.js';
import type { UserAccount } from '../domain/user-account.js';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
  roles: RoleCode[];
}

export type AuthClientType = 'WEB' | 'MOBILE';
export type LoginAlertStatus = 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';

export interface LoginContext {
  clientType: AuthClientType;
  deviceId: string;
  deviceName: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthSessionRecord extends LoginContext {
  id: string;
  userId: string;
  signedInAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  refreshTokenHash: string | null;
  previousRefreshTokenHash: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  loginAlertStatus: LoginAlertStatus;
  loginAlertSentAt: Date | null;
  loginAlertNote: string | null;
}

export interface AuthSessionAuditRecord extends AuthSessionRecord {
  accountEmail: string;
  displayName: string;
}

export interface AuthSessionRepository {
  replaceActiveSession(
    userId: string,
    context: LoginContext,
    expiresAt: Date,
    refreshTokenHash: string,
  ): Promise<AuthSessionRecord>;
  findActive(
    sessionId: string,
    userId?: string,
  ): Promise<AuthSessionRecord | null>;
  rotateRefreshToken(
    sessionId: string,
    expectedHash: string,
    nextHash: string,
  ): Promise<boolean>;
  touch(sessionId: string): Promise<void>;
  revoke(sessionId: string, reason: string): Promise<boolean>;
  listAll(limit: number): Promise<AuthSessionAuditRecord[]>;
  markLoginAlert(
    sessionId: string,
    status: Exclude<LoginAlertStatus, 'PENDING'>,
    note: string | null,
  ): Promise<void>;
}

export interface LoginAlertInput {
  accountEmail: string;
  displayName: string;
  deviceName: string;
  clientType: AuthClientType;
  ipAddress: string | null;
  signedInAt: Date;
}

export interface LoginAlertResult {
  status: 'SENT' | 'SKIPPED';
  note: string | null;
}

export interface LoginAlertSender {
  send(input: LoginAlertInput): Promise<LoginAlertResult>;
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
export const AUTH_SESSION_REPOSITORY = Symbol('AUTH_SESSION_REPOSITORY');
export const LOGIN_ALERT_SENDER = Symbol('LOGIN_ALERT_SENDER');
