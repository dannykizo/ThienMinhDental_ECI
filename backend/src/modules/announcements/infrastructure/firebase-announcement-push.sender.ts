import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DataSource } from 'typeorm';
import { announcementPushPayload } from './announcement-push.payload.js';
import { PushDeviceTokenEntity } from '../../../database/entities/push-device-token.entity.js';
import type {
  AnnouncementPushResult,
  AnnouncementPushSender,
} from '../application/announcement-push.sender.js';

interface PushTokenRow {
  employeeId: string;
  id: string;
  token: string;
  userId: string;
}

@Injectable()
export class FirebaseAnnouncementPushSender
  implements AnnouncementPushSender
{
  private readonly logger = new Logger(FirebaseAnnouncementPushSender.name);
  private readonly app?: App;

  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    const enabled =
      config.get<string>('FIREBASE_PUSH_ENABLED', 'false').toLowerCase() ===
      'true';
    if (!enabled) {
      this.logger.log(
        'FCM push is disabled. Inbox delivery remains available.',
      );
      return;
    }

    const projectId = config.get<string>('FIREBASE_PROJECT_ID');
    try {
      this.app =
        getApps()[0] ??
        initializeApp({ credential: applicationDefault(), projectId });
    } catch (error) {
      this.logger.error(
        `Unable to initialize Firebase Admin: ${this.errorMessage(error)}`,
      );
    }
  }

  isConfigured(): boolean {
    return this.app !== undefined;
  }

  async sendAnnouncement(input: {
    announcementId: string;
    body: string;
    employeeIds: string[];
    requiresAcknowledgement: boolean;
    title: string;
  }): Promise<AnnouncementPushResult> {
    if (input.employeeIds.length === 0) return this.skippedResult([], 'NO_RECIPIENTS');
    if (!this.app) {
      return this.skippedResult(input.employeeIds, 'PUSH_NOT_CONFIGURED');
    }

    let tokens: PushTokenRow[];
    try {
      tokens = await this.dataSource
        .getRepository(PushDeviceTokenEntity)
        .createQueryBuilder('device')
        .select([
          'device.id AS id',
          'device.employee_id AS "employeeId"',
          'device.token AS token',
          'device.user_id AS "userId"',
        ])
        .where('device.is_active = true')
        .andWhere('device.employee_id IN (:...employeeIds)', {
          employeeIds: input.employeeIds,
        })
        .andWhere(`EXISTS (SELECT 1 FROM employees e JOIN users u ON u.id=e.user_id
          JOIN auth_sessions s ON s.user_id=u.id
          WHERE e.id=device.employee_id AND u.id=device.user_id
            AND e.is_active=true AND u.is_active=true
            AND s.client_type='MOBILE' AND s.device_id=device.device_id
            AND s.revoked_at IS NULL AND s.expires_at>now())`)
        .getRawMany<PushTokenRow>();
    } catch (error) {
      this.logger.error(`Unable to load FCM devices: ${this.errorMessage(error)}`);
      return this.failedResult(input.employeeIds, 'PUSH_DEVICE_LOOKUP_FAILED');
    }

    if (tokens.length === 0) {
      return this.skippedResult(input.employeeIds, 'NO_ACTIVE_DEVICE');
    }

    let delivered = 0;
    let failed = 0;
    const employeeOutcomes = new Map<
      string,
      { delivered: number; errors: string[] }
    >();
    input.employeeIds.forEach((employeeId) =>
      employeeOutcomes.set(employeeId, { delivered: 0, errors: [] }),
    );
    try {
      for (let offset = 0; offset < tokens.length; offset += 500) {
        const chunk = tokens.slice(offset, offset + 500);
        const response = await getMessaging(this.app).sendEach(chunk.map((item) => ({
          ...announcementPushPayload(input, item.userId), token: item.token,
        })));

        const now = new Date();
        await Promise.all(
          response.responses.map(async (result, index) => {
            const token = chunk[index];
            if (result.success) {
              delivered += 1;
              const outcome = employeeOutcomes.get(token.employeeId);
              if (outcome) outcome.delivered += 1;
              await this.dataSource.query(
                `UPDATE push_device_tokens SET last_push_at=$2,last_error=NULL,updated_at=$2 WHERE id=$1`,
                [token.id, now],
              );
              return;
            }

            failed += 1;
            const code = result.error?.code ?? 'messaging/unknown-error';
            employeeOutcomes.get(token.employeeId)?.errors.push(code);
            const invalid =
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered';
            await this.dataSource.query(
              `UPDATE push_device_tokens SET is_active=CASE WHEN $3 THEN false ELSE is_active END,last_error=$2,updated_at=now() WHERE id=$1`,
              [token.id, code, invalid],
            );
          }),
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`FCM send failed: ${message}`);
      await this.dataSource.query(
        `UPDATE push_device_tokens SET last_error=$2,updated_at=now() WHERE id = ANY($1::uuid[])`,
        [tokens.map((item) => item.id), 'FCM_SEND_FAILED'],
      );
      return this.failedResult(input.employeeIds, 'FCM_SEND_FAILED', tokens.length);
    }

    const recipients = input.employeeIds.map((employeeId) => {
      const tokenCount = tokens.filter(
        (token) => token.employeeId === employeeId,
      ).length;
      const outcome = employeeOutcomes.get(employeeId);
      if (tokenCount === 0) {
        return {
          employeeId,
          failureCode: 'NO_ACTIVE_DEVICE',
          status: 'SKIPPED' as const,
        };
      }
      if ((outcome?.delivered ?? 0) > 0) {
        return { employeeId, status: 'SENT' as const };
      }
      return {
        employeeId,
        failureCode: outcome?.errors[0] ?? 'messaging/unknown-error',
        status: 'FAILED' as const,
      };
    });
    const skipped = recipients.filter((item) => item.status === 'SKIPPED').length;
    return {
      attempted: tokens.length,
      delivered,
      failed,
      recipients,
      skipped,
      status: failed === 0 && skipped === 0 ? 'SENT' : 'FAILED',
    };
  }

  private failedResult(
    employeeIds: string[],
    failureCode: string,
    attempted = 0,
  ): AnnouncementPushResult {
    return {
      attempted,
      delivered: 0,
      failed: employeeIds.length,
      recipients: employeeIds.map((employeeId) => ({
        employeeId,
        failureCode,
        status: 'FAILED',
      })),
      skipped: 0,
      status: 'FAILED',
    };
  }

  private skippedResult(
    employeeIds: string[],
    failureCode: string,
  ): AnnouncementPushResult {
    return {
      attempted: 0,
      delivered: 0,
      failed: 0,
      recipients: employeeIds.map((employeeId) => ({
        employeeId,
        failureCode,
        status: 'SKIPPED',
      })),
      skipped: employeeIds.length,
      status: 'SKIPPED',
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
