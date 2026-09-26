import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { OperationsAuditQueryDto } from './operations.dto.js';

@Injectable()
export class OperationsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(): Promise<Record<string, unknown>> {
    const [[counts], [delivery]] = await Promise.all([
      this.dataSource.query<Array<Record<string, number>>>(`
      SELECT
        (SELECT COUNT(*)::int FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > now()) AS "activeSessions",
        (SELECT COUNT(*)::int FROM auth_sessions WHERE login_alert_status='FAILED' AND signed_in_at >= now() - interval '24 hours') AS "loginAlertFailures24h",
        (SELECT COUNT(*)::int FROM announcement_recipients WHERE push_status='FAILED') AS "pushFailures",
        (SELECT COUNT(*)::int FROM announcement_recipients WHERE push_status='PENDING') AS "pushPending",
        (SELECT COUNT(*)::int FROM attendance_explanation_requests WHERE status IN ('REQUESTED','SUBMITTED')) AS "openExplanations",
        (SELECT COUNT(*)::int FROM leave_requests WHERE status='SUBMITTED') AS "pendingLeave",
        (SELECT COUNT(*)::int FROM business_trips WHERE status IN ('ASSIGNED','IN_PROGRESS')) AS "activeTrips",
        (SELECT COUNT(*)::int FROM configuration_audit_logs WHERE created_at >= now() - interval '24 hours') AS "auditEvents24h"
    `),
      this.dataSource.query<Array<{ lastEmailAlertAt: Date | null; lastPushAt: Date | null }>>(`
        SELECT
          (SELECT MAX(login_alert_sent_at) FROM auth_sessions WHERE login_alert_status='SENT') AS "lastEmailAlertAt",
          (SELECT MAX(push_sent_at) FROM announcement_recipients WHERE push_status='SENT') AS "lastPushAt"
      `),
    ]);
    return {
      ...(counts ?? {}),
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      release: process.env.RELEASE_SHA?.trim() || 'development',
      pendingMigrations: await this.dataSource.showMigrations(),
      integrations: {
        emailAlerts: Boolean(process.env.SMTP_HOST && process.env.ADMIN_LOGIN_ALERT_EMAILS),
        firebasePush: process.env.FIREBASE_PUSH_ENABLED === 'true',
        attendanceEvidence: Boolean(process.env.EVIDENCE_STORAGE_DIR),
        businessTripEvidence: Boolean(process.env.BUSINESS_TRIP_EVIDENCE_STORAGE_DIR),
      },
      lastDelivery: {
        emailAlertAt: delivery?.lastEmailAlertAt?.toISOString() ?? null,
        pushAt: delivery?.lastPushAt?.toISOString() ?? null,
      },
    };
  }

  async audit(query: OperationsAuditQueryDto): Promise<Record<string, unknown>> {
    const values = [query.resourceType ?? null, query.action ?? null, query.from ?? null, query.to ?? null];
    const [items, countRows] = await Promise.all([this.dataSource.query<unknown[]>(
      `SELECT l.id,l.resource_type AS "resourceType",l.resource_id AS "resourceId",l.action,
        l.old_value AS "oldValue",l.new_value AS "newValue",l.created_at AS "createdAt",
        COALESCE(e.full_name,u.email) AS "actorName"
       FROM configuration_audit_logs l
       JOIN users u ON u.id=l.created_by
       LEFT JOIN employees e ON e.user_id=u.id
       WHERE ($1::text IS NULL OR l.resource_type=$1)
         AND ($2::text IS NULL OR l.action=$2)
         AND ($3::timestamptz IS NULL OR l.created_at >= $3)
         AND ($4::timestamptz IS NULL OR l.created_at <= $4)
       ORDER BY l.created_at DESC LIMIT $5 OFFSET $6`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    ), this.dataSource.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM configuration_audit_logs l
       WHERE ($1::text IS NULL OR l.resource_type=$1)
         AND ($2::text IS NULL OR l.action=$2)
         AND ($3::timestamptz IS NULL OR l.created_at >= $3)
         AND ($4::timestamptz IS NULL OR l.created_at <= $4)`, values,
    )]);
    const count = countRows[0];
    return { items, page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
  }
}
