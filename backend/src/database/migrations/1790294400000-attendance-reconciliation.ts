import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceReconciliation1790294400000 implements MigrationInterface {
  name = 'AttendanceReconciliation1790294400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_explanation_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
        "work_date" date NOT NULL,
        "attendance_event_id" uuid REFERENCES "attendance_events"("id") ON DELETE SET NULL,
        "issue_type" varchar(40) NOT NULL,
        "request_note" text NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'REQUESTED',
        "due_at" timestamptz NOT NULL,
        "requested_by" uuid NOT NULL REFERENCES "users"("id"),
        "response_text" text,
        "evidence_image_reference" varchar(500),
        "evidence_captured_at" timestamptz,
        "evidence_latitude" double precision,
        "evidence_longitude" double precision,
        "reviewed_by" uuid REFERENCES "users"("id"),
        "review_note" text,
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_attendance_explanation_issue" CHECK ("issue_type" IN ('MISSING_CHECK_IN','MISSING_CHECK_OUT','DUPLICATE_ATTEMPT','WRONG_DATE_OR_DEVICE_TIME','GPS_RISK','OTHER')),
        CONSTRAINT "chk_attendance_explanation_status" CHECK ("status" IN ('REQUESTED','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
        CONSTRAINT "chk_attendance_evidence_coordinates" CHECK (("evidence_latitude" IS NULL AND "evidence_longitude" IS NULL) OR ("evidence_latitude" BETWEEN -90 AND 90 AND "evidence_longitude" BETWEEN -180 AND 180))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_attendance_explanation_employee_date" ON "attendance_explanation_requests"("employee_id", "work_date")`);
    await queryRunner.query(`CREATE INDEX "idx_attendance_explanation_status_due" ON "attendance_explanation_requests"("status", "due_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_attendance_explanation_active" ON "attendance_explanation_requests"("employee_id", "work_date", "issue_type") WHERE "status" IN ('REQUESTED','SUBMITTED')`);

    await queryRunner.query(`
      CREATE TABLE "attendance_periods" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "period_month" date NOT NULL UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'OPEN',
        "locked_by" uuid REFERENCES "users"("id"),
        "locked_at" timestamptz,
        "reopened_by" uuid REFERENCES "users"("id"),
        "reopened_at" timestamptz,
        "reopen_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_attendance_period_month" CHECK (extract(day from "period_month") = 1),
        CONSTRAINT "chk_attendance_period_status" CHECK ("status" IN ('OPEN','LOCKED'))
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "attendance_periods"');
    await queryRunner.query('DROP TABLE "attendance_explanation_requests"');
  }
}
