import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthSessions1790121600000 implements MigrationInterface {
  name = 'AuthSessions1790121600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "device_id" varchar(128) NOT NULL,
        "device_name" varchar(160) NOT NULL,
        "client_type" varchar(20) NOT NULL,
        "ip_address" inet,
        "user_agent" varchar(500),
        "signed_in_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "revoke_reason" varchar(40),
        "login_alert_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "login_alert_sent_at" timestamptz,
        "login_alert_note" varchar(200),
        CHECK ("client_type" IN ('WEB', 'MOBILE')),
        CHECK ("login_alert_status" IN ('PENDING', 'SENT', 'SKIPPED', 'FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_auth_sessions_user_signed_in" ON "auth_sessions"("user_id", "signed_in_at" DESC)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_auth_sessions_one_active_per_user" ON "auth_sessions"("user_id") WHERE "revoked_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "auth_sessions"');
  }
}
