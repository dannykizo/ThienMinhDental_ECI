import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduleLocationAlignment1790208000000
  implements MigrationInterface
{
  name = 'ScheduleLocationAlignment1790208000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_schedules" ADD COLUMN "early_leave_tolerance_minutes" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "work_schedules" ADD COLUMN "required_work_minutes" int NOT NULL DEFAULT 480`);
    await queryRunner.query(`ALTER TABLE "work_schedules" ALTER COLUMN "late_tolerance_minutes" SET DEFAULT 3`);
    await queryRunner.query(`ALTER TABLE "work_schedules" ADD CONSTRAINT "chk_schedule_required_minutes" CHECK ("required_work_minutes" > 0 AND "required_work_minutes" <= 1440)`);
    await queryRunner.query(`ALTER TABLE "work_schedules" ADD CONSTRAINT "chk_schedule_early_tolerance" CHECK ("early_leave_tolerance_minutes" >= 0 AND "early_leave_tolerance_minutes" <= 180)`);

    await queryRunner.query(`
      CREATE TABLE "department_schedules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
        "department_id" uuid NOT NULL REFERENCES "departments"("id"),
        "schedule_id" uuid NOT NULL REFERENCES "work_schedules"("id"),
        "effective_from" date NOT NULL,
        "effective_to" date,
        CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        UNIQUE("branch_id", "department_id", "schedule_id", "effective_from")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_department_schedules_scope" ON "department_schedules"("branch_id", "department_id", "effective_from")`);

    await queryRunner.query(`ALTER TABLE "office_locations" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id")`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD COLUMN "location_type" varchar(30) NOT NULL DEFAULT 'OFFICE'`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD CONSTRAINT "chk_office_location_type" CHECK ("location_type" IN ('OFFICE', 'EXTERNAL_WORKPLACE'))`);
    await queryRunner.query(`UPDATE "office_locations" SET "radius_meters"=LEAST("radius_meters", 50), "accuracy_threshold_meters"=LEAST("accuracy_threshold_meters", 50)`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD CONSTRAINT "chk_office_radius_customer_limit" CHECK ("radius_meters" <= 50)`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD CONSTRAINT "chk_office_accuracy_customer_limit" CHECK ("accuracy_threshold_meters" <= 50)`);
    await queryRunner.query(`CREATE INDEX "idx_office_locations_branch" ON "office_locations"("branch_id")`);

    await queryRunner.query(`ALTER TABLE "attendance_events" ADD COLUMN "office_location_id" uuid REFERENCES "office_locations"("id") ON DELETE SET NULL`);

    await queryRunner.query(`
      CREATE TABLE "configuration_audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resource_type" varchar(40) NOT NULL,
        "resource_id" uuid NOT NULL,
        "action" varchar(40) NOT NULL,
        "old_value" jsonb,
        "new_value" jsonb,
        "created_by" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_configuration_audit_resource" ON "configuration_audit_logs"("resource_type", "resource_id", "created_at" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "configuration_audit_logs"');
    await queryRunner.query('ALTER TABLE "attendance_events" DROP COLUMN "office_location_id"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP CONSTRAINT "chk_office_accuracy_customer_limit"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP CONSTRAINT "chk_office_radius_customer_limit"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP CONSTRAINT "chk_office_location_type"');
    await queryRunner.query('DROP INDEX "idx_office_locations_branch"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP COLUMN "updated_at"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP COLUMN "created_at"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP COLUMN "location_type"');
    await queryRunner.query('ALTER TABLE "office_locations" DROP COLUMN "branch_id"');
    await queryRunner.query('DROP TABLE "department_schedules"');
    await queryRunner.query('ALTER TABLE "work_schedules" DROP CONSTRAINT "chk_schedule_early_tolerance"');
    await queryRunner.query('ALTER TABLE "work_schedules" DROP CONSTRAINT "chk_schedule_required_minutes"');
    await queryRunner.query('ALTER TABLE "work_schedules" DROP COLUMN "required_work_minutes"');
    await queryRunner.query('ALTER TABLE "work_schedules" DROP COLUMN "early_leave_tolerance_minutes"');
    await queryRunner.query('ALTER TABLE "work_schedules" ALTER COLUMN "late_tolerance_minutes" SET DEFAULT 0');
  }
}
