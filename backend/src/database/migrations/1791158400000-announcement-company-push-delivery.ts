import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AnnouncementCompanyPushDelivery1791158400000
  implements MigrationInterface
{
  name = 'AnnouncementCompanyPushDelivery1791158400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" ADD COLUMN "push_status" varchar(20) NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" ADD COLUMN "push_attempt_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" ADD COLUMN "push_last_attempt_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" ADD COLUMN "push_sent_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" ADD COLUMN "push_failure_code" varchar(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipient_push_status_check" CHECK ("push_status" IN ('PENDING','SENT','SKIPPED','FAILED'))`,
    );
    await queryRunner.query(
      `UPDATE "announcement_recipients" SET "push_status"='SKIPPED', "push_failure_code"='LEGACY_NOT_TRACKED'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_announcement_recipients_push_status" ON "announcement_recipients"("announcement_id", "push_status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_announcement_recipients_push_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" DROP CONSTRAINT "announcement_recipient_push_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" DROP COLUMN "push_failure_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" DROP COLUMN "push_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" DROP COLUMN "push_last_attempt_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" DROP COLUMN "push_attempt_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "announcement_recipients" DROP COLUMN "push_status"`,
    );
  }
}
