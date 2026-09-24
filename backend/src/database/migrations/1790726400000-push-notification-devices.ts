import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PushNotificationDevices1790726400000
  implements MigrationInterface
{
  name = 'PushNotificationDevices1790726400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_device_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "device_id" varchar(200) NOT NULL,
        "platform" varchar(20) NOT NULL,
        "token" text NOT NULL UNIQUE,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_registered_at" timestamptz NOT NULL DEFAULT now(),
        "last_push_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_push_device_platform" CHECK ("platform" IN ('ANDROID')),
        CONSTRAINT "uq_push_device_user_device" UNIQUE ("user_id", "device_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_push_device_employee_active" ON "push_device_tokens"("employee_id", "is_active")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_push_device_employee_active"`);
    await queryRunner.query(`DROP TABLE "push_device_tokens"`);
  }
}
