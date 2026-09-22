import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan } from 'typeorm';
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

@Injectable()
export class TypeOrmAuthSessionRepository implements AuthSessionRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async replaceActiveSession(
    userId: string,
    context: LoginContext,
    expiresAt: Date,
  ): Promise<AuthSessionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AuthSessionEntity);
      await repository.update(
        { userId, revokedAt: IsNull() },
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

  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const count = await this.dataSource.getRepository(AuthSessionEntity).count({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    return count === 1;
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
      revokedAt: session.revokedAt,
      revokeReason: session.revokeReason,
      loginAlertStatus: session.loginAlertStatus,
      loginAlertSentAt: session.loginAlertSentAt,
      loginAlertNote: session.loginAlertNote,
    };
  }
}
