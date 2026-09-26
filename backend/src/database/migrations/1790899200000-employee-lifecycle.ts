import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeLifecycle1790899200000 implements MigrationInterface {
  name = 'EmployeeLifecycle1790899200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employees" ADD COLUMN "employment_end_date" date`);
    await queryRunner.query(`ALTER TABLE "employees" ADD COLUMN "employment_status_reason" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "employees" ADD COLUMN "status_changed_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "employees" ADD COLUMN "status_changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL`);
    await queryRunner.query(`
      UPDATE "employees"
      SET "employment_end_date" = CURRENT_DATE,
          "employment_status_reason" = 'Dữ liệu trạng thái có trước CR1',
          "status_changed_at" = now()
      WHERE "is_active" = false
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "chk_employee_inactive_lifecycle"
      CHECK (
        ("is_active" = true AND "employment_end_date" IS NULL AND "employment_status_reason" IS NULL)
        OR
        ("is_active" = false AND "employment_end_date" IS NOT NULL AND length(trim("employment_status_reason")) >= 5)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_employees_active_name" ON "employees"("is_active", "full_name")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_employees_active_name"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "chk_employee_inactive_lifecycle"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "status_changed_by"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "status_changed_at"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "employment_status_reason"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "employment_end_date"`);
  }
}
