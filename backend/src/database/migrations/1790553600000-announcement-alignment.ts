import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AnnouncementAlignment1790553600000 implements MigrationInterface {
  name = 'AnnouncementAlignment1790553600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "announcements" ADD COLUMN "employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD COLUMN "requires_acknowledgement" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD COLUMN "withdrawn_by" uuid REFERENCES "users"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD COLUMN "withdrawn_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD COLUMN "withdraw_reason" text`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "announcements_status_check"`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "announcements_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','CANCELLED','WITHDRAWN'))`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "announcements_audience_type_check"`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_type_check" CHECK ("audience_type" IN ('ALL','DEPARTMENT','EMPLOYEE'))`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "chk_announcement_target" CHECK (("audience_type"='ALL' AND "department_id" IS NULL AND "employee_id" IS NULL) OR ("audience_type"='DEPARTMENT' AND "department_id" IS NOT NULL AND "employee_id" IS NULL) OR ("audience_type"='EMPLOYEE' AND "employee_id" IS NOT NULL AND "department_id" IS NULL))`);
    await queryRunner.query(`ALTER TABLE "announcement_recipients" ADD COLUMN "acknowledged_at" timestamptz`);
    await queryRunner.query(`CREATE INDEX "idx_announcements_status_published" ON "announcements"("status", "published_at")`);
    await queryRunner.query(`CREATE INDEX "idx_announcement_recipients_employee" ON "announcement_recipients"("employee_id", "read_at", "acknowledged_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_announcement_recipients_employee"`);
    await queryRunner.query(`DROP INDEX "idx_announcements_status_published"`);
    await queryRunner.query(`ALTER TABLE "announcement_recipients" DROP COLUMN "acknowledged_at"`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "chk_announcement_target"`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "announcements_audience_type_check"`);
    await queryRunner.query(`UPDATE "announcements" SET "audience_type"='ALL', "employee_id"=NULL WHERE "audience_type"='EMPLOYEE'`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_type_check" CHECK ("audience_type" IN ('ALL','DEPARTMENT'))`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "announcements_status_check"`);
    await queryRunner.query(`UPDATE "announcements" SET "status"='CANCELLED' WHERE "status"='WITHDRAWN'`);
    await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "announcements_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','CANCELLED'))`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP COLUMN "withdraw_reason"`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP COLUMN "withdrawn_at"`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP COLUMN "withdrawn_by"`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP COLUMN "requires_acknowledgement"`);
    await queryRunner.query(`ALTER TABLE "announcements" DROP COLUMN "employee_id"`);
  }
}
