import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, MoreThan } from 'typeorm';
import {
  AuthClientType,
  AuthSessionEntity,
  LoginAlertStatus,
} from '../../../database/entities/auth-session.entity.js';
import type {
  AuthSessionAuditRecord,
  AuthSessionRecord,
  AuthSessionRepository,
  LoginContext,
} from '../application/auth.ports.js';
import { portalAccess, replacesSession, type PortalAccess } from '../domain/portal-access.js';
import { RoleCode } from '../domain/role-code.js';
import { readManagementGrants } from '../../organization-access/infrastructure/management-grant.reader.js';

@Injectable()
export class TypeOrmAuthSessionRepository implements AuthSessionRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getPortalAccess(userId: string): Promise<PortalAccess> {
    return this.accessFor(this.dataSource.manager, userId);
  }

  private async accessFor(manager: EntityManager, userId: string): Promise<PortalAccess> {
    const [account] = await manager.query<Array<{ active: boolean; roles: RoleCode[] }>>(`SELECT
      (u.is_active AND COALESCE(e.is_active,true)) AS active,
      ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id) AS roles
      FROM users u LEFT JOIN employees e ON e.user_id=u.id WHERE u.id=$1`, [userId]);
    if (!account?.active) return portalAccess([], [], new Date());
    return portalAccess(account.roles, await readManagementGrants(manager, userId), new Date());
  }

  private async lockAccount(manager: EntityManager, userId: string): Promise<boolean> {
    const [account] = await manager.query<Array<{ active: boolean }>>(`SELECT (u.is_active AND COALESCE(e.is_active,true)) AS active
      FROM users u LEFT JOIN employees e ON e.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`, [userId]);
    return account?.active === true;
  }

  private async reconcile(manager: EntityManager, userId: string, access: PortalAccess): Promise<void> {
    const repository = manager.getRepository(AuthSessionEntity);
    // Losing the last scoped grant must not eject the employee's Mobile session.
    // For single-account legacy Web users, keep Mobile if both channels exist.
    const mobile = access.sessionMode === 'SINGLE_ACCOUNT' && await repository.exists({ where: {
      userId, clientType: AuthClientType.Mobile, revokedAt: IsNull(), expiresAt: MoreThan(new Date()),
    } });
    if (!access.webAllowed || mobile) {
      await repository.update({ userId, clientType: AuthClientType.Web, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason: 'MANAGEMENT_ACCESS_ENDED' });
    }
  }

  async replaceActiveSession(
    userId: string,
    context: LoginContext,
    expiresAt: Date,
    refreshTokenHash: string,
  ): Promise<AuthSessionRecord> {
    return this.dataSource.transaction(async (manager) => {
      if (!await this.lockAccount(manager, userId)) throw new UnauthorizedException({ code: 'SESSION_USER_UNAVAILABLE', message: 'Tài khoản không còn hoạt động.' });
      const access = await this.accessFor(manager, userId);
      // Deny before replacing anything: an employee trying the Web login must
      // not lose their working Mobile session.
      if (context.clientType === 'WEB' && !access.webAllowed) {
        throw new ForbiddenException({ code: 'WEB_ACCESS_DENIED', message: 'Tài khoản chưa có quyền truy cập Web quản lý. Vui lòng dùng app nhân viên.' });
      }
      const repository = manager.getRepository(AuthSessionEntity);
      const otherChannel = context.clientType === 'WEB' ? 'MOBILE' : 'WEB';
      const criteria = replacesSession(access.sessionMode, context.clientType, otherChannel)
        ? { userId, revokedAt: IsNull() }
        : { userId, clientType: context.clientType as AuthClientType, revokedAt: IsNull() };
      // Account locking serializes concurrent cross-channel logins, including
      // ordinary employees (whose invariant is stricter than the DB index).
      await repository.update(
        criteria,
        { revokedAt: new Date(), revokeReason: 'REPLACED_BY_NEW_LOGIN' },
      );

      const saved = await repository.save(
        repository.create({
          userId,
          deviceId: context.deviceId,
          deviceName: context.deviceName,
          clientType: context.clientType as AuthClientType,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          expiresAt,
          lastSeenAt: new Date(),
          refreshTokenHash,
          previousRefreshTokenHash: null,
          revokedAt: null,
          revokeReason: null,
          loginAlertStatus: LoginAlertStatus.Pending,
          loginAlertSentAt: null,
          loginAlertNote: null,
        }),
      );

      return this.toRecord(saved);
    });
  }

  async findActive(
    sessionId: string,
    userId?: string,
  ): Promise<AuthSessionRecord | null> {
    const candidate = await this.dataSource.getRepository(AuthSessionEntity).findOne({
      where: { id: sessionId, ...(userId ? { userId } : {}) },
    });
    if (!candidate) return null;
    return this.dataSource.transaction(async (manager) => {
      if (!await this.lockAccount(manager, candidate.userId)) {
        await manager.getRepository(AuthSessionEntity).update({ userId: candidate.userId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokeReason: 'SESSION_USER_UNAVAILABLE' });
        return null;
      }
      await this.reconcile(manager, candidate.userId, await this.accessFor(manager, candidate.userId));
      const entity = await manager.getRepository(AuthSessionEntity).findOne({ where: {
        id: sessionId, userId: candidate.userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()),
      } });
      return entity ? this.toRecord(entity) : null;
    });
  }

  async rotateRefreshToken(
    sessionId: string,
    expectedHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({
        previousRefreshTokenHash: expectedHash,
        refreshTokenHash: nextHash,
        lastSeenAt: new Date(),
      })
      .where('id = :sessionId', { sessionId })
      .andWhere('refresh_token_hash = :expectedHash', { expectedHash })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > now()')
      .execute();
    return (result.affected ?? 0) === 1;
  }

  async touch(sessionId: string): Promise<void> {
    await this.dataSource.getRepository(AuthSessionEntity).update(
      { id: sessionId, revokedAt: IsNull() },
      { lastSeenAt: new Date() },
    );
  }

  async revoke(sessionId: string, reason: string): Promise<boolean> {
    const result = await this.dataSource.getRepository(AuthSessionEntity).update(
      { id: sessionId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokeReason: reason },
    );
    return (result.affected ?? 0) > 0;
  }

  async listAll(limit: number): Promise<AuthSessionAuditRecord[]> {
    const sessions = await this.dataSource
      .getRepository(AuthSessionEntity)
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .leftJoinAndSelect('user.employee', 'employee')
      .orderBy('session.signedInAt', 'DESC')
      .take(limit)
      .getMany();

    return sessions.map((session) => ({
      ...this.toRecord(session),
      accountEmail: session.user.email,
      displayName: session.user.employee?.fullName ?? session.user.email,
    }));
  }

  async markLoginAlert(
    sessionId: string,
    status: 'SENT' | 'SKIPPED' | 'FAILED',
    note: string | null,
  ): Promise<void> {
    await this.dataSource.getRepository(AuthSessionEntity).update(sessionId, {
      loginAlertStatus: status as LoginAlertStatus,
      loginAlertSentAt: status === 'SENT' ? new Date() : null,
      loginAlertNote: note,
    });
  }

  private toRecord(session: AuthSessionEntity): AuthSessionRecord {
    return {
      id: session.id,
      userId: session.userId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      clientType: session.clientType,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      signedInAt: session.signedInAt,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt,
      refreshTokenHash: session.refreshTokenHash,
      previousRefreshTokenHash: session.previousRefreshTokenHash,
      revokedAt: session.revokedAt,
      revokeReason: session.revokeReason,
      loginAlertStatus: session.loginAlertStatus,
      loginAlertSentAt: session.loginAlertSentAt,
      loginAlertNote: session.loginAlertNote,
    };
  }
}
