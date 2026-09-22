import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveOperations1790467200000 implements MigrationInterface {
  name = 'LeaveOperations1790467200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "submitted_at" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`UPDATE "leave_requests" SET "submitted_at"="created_at"`);
    await queryRunner.query(`CREATE INDEX "idx_leave_requests_employee_dates" ON "leave_requests"("employee_id", "start_date", "end_date")`);
    await queryRunner.query(`CREATE INDEX "idx_leave_requests_status_dates" ON "leave_requests"("status", "start_date", "end_date")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_leave_requests_status_dates"`);
    await queryRunner.query(`DROP INDEX "idx_leave_requests_employee_dates"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "submitted_at"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "submitted_by"`);
  }
}
