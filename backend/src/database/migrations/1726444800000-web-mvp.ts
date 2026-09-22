import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WebMvp1726444800000 implements MigrationInterface {
  name = 'WebMvp1726444800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employees" ADD COLUMN "employee_type" varchar(20) NOT NULL DEFAULT 'OFFICE', ADD COLUMN "phone" varchar(30), ADD COLUMN "hire_date" date, ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now(), ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`CREATE TABLE "work_schedules" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar(120) NOT NULL, "weekdays" int[] NOT NULL, "start_time" time NOT NULL, "end_time" time NOT NULL, "late_tolerance_minutes" int NOT NULL DEFAULT 0, "is_active" boolean NOT NULL DEFAULT true)`);
    await queryRunner.query(`CREATE TABLE "employee_schedules" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE, "schedule_id" uuid NOT NULL REFERENCES "work_schedules"("id") ON DELETE CASCADE, "effective_from" date NOT NULL, "effective_to" date, UNIQUE("employee_id", "schedule_id", "effective_from"))`);
    await queryRunner.query(`CREATE TABLE "office_locations" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar(120) NOT NULL, "address" varchar(300) NOT NULL, "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "radius_meters" int NOT NULL CHECK ("radius_meters" > 0), "accuracy_threshold_meters" int NOT NULL DEFAULT 100 CHECK ("accuracy_threshold_meters" > 0), "is_active" boolean NOT NULL DEFAULT true)`);
    await queryRunner.query(`CREATE TABLE "customers" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" varchar(180) NOT NULL, "address" varchar(300) NOT NULL, "contact_name" varchar(120), "contact_phone" varchar(30))`);
    await queryRunner.query(`CREATE TABLE "business_trips" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "code" varchar(30) NOT NULL UNIQUE, "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL, "site_name" varchar(180) NOT NULL, "site_address" varchar(300) NOT NULL, "start_at" timestamptz NOT NULL, "end_at" timestamptz NOT NULL, "content" text NOT NULL, "requires_photo" boolean NOT NULL DEFAULT false, "status" varchar(30) NOT NULL DEFAULT 'DRAFT', "created_by" uuid NOT NULL REFERENCES "users"("id"), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CHECK ("end_at" > "start_at"), CHECK ("status" IN ('DRAFT','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')))`);
    await queryRunner.query(`CREATE TABLE "business_trip_members" ("business_trip_id" uuid NOT NULL REFERENCES "business_trips"("id") ON DELETE CASCADE, "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE, "participation_status" varchar(30) NOT NULL DEFAULT 'ASSIGNED', "started_at" timestamptz, "completed_at" timestamptz, "note" text, PRIMARY KEY("business_trip_id", "employee_id"))`);
    await queryRunner.query(`CREATE TABLE "attendance_events" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employee_id" uuid NOT NULL REFERENCES "employees"("id"), "event_type" varchar(20) NOT NULL CHECK ("event_type" IN ('CHECK_IN','CHECK_OUT')), "attendance_type" varchar(30) NOT NULL CHECK ("attendance_type" IN ('OFFICE','BUSINESS_TRIP')), "server_time" timestamptz NOT NULL, "device_time" timestamptz, "latitude" double precision, "longitude" double precision, "accuracy_meters" double precision, "risk_flags" text[] NOT NULL DEFAULT '{}', "business_trip_id" uuid REFERENCES "business_trips"("id") ON DELETE SET NULL, "created_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX "idx_attendance_employee_time" ON "attendance_events"("employee_id", "server_time")`);
    await queryRunner.query(`CREATE TABLE "attendance_adjustments" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employee_id" uuid NOT NULL REFERENCES "employees"("id"), "work_date" date NOT NULL, "field_name" varchar(40) NOT NULL, "old_value" jsonb, "new_value" jsonb NOT NULL, "reason" text NOT NULL, "adjusted_by" uuid NOT NULL REFERENCES "users"("id"), "created_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE TABLE "leave_requests" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employee_id" uuid NOT NULL REFERENCES "employees"("id"), "leave_type" varchar(30) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "reason" text NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'SUBMITTED', "reviewed_by" uuid REFERENCES "users"("id"), "review_note" text, "reviewed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CHECK ("end_date" >= "start_date"), CHECK ("status" IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')))`);
    await queryRunner.query(`CREATE TABLE "announcements" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "title" varchar(200) NOT NULL, "body" text NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'DRAFT', "audience_type" varchar(30) NOT NULL DEFAULT 'ALL', "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL, "created_by" uuid NOT NULL REFERENCES "users"("id"), "published_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CHECK ("status" IN ('DRAFT','PUBLISHED','CANCELLED')), CHECK ("audience_type" IN ('ALL','DEPARTMENT')))`);
    await queryRunner.query(`CREATE TABLE "announcement_recipients" ("announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE, "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE, "delivered_at" timestamptz, "read_at" timestamptz, PRIMARY KEY("announcement_id", "employee_id"))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "announcement_recipients"');
    await queryRunner.query('DROP TABLE "announcements"');
    await queryRunner.query('DROP TABLE "leave_requests"');
    await queryRunner.query('DROP TABLE "attendance_adjustments"');
    await queryRunner.query('DROP TABLE "attendance_events"');
    await queryRunner.query('DROP TABLE "business_trip_members"');
    await queryRunner.query('DROP TABLE "business_trips"');
    await queryRunner.query('DROP TABLE "customers"');
    await queryRunner.query('DROP TABLE "office_locations"');
    await queryRunner.query('DROP TABLE "employee_schedules"');
    await queryRunner.query('DROP TABLE "work_schedules"');
    await queryRunner.query('ALTER TABLE "employees" DROP COLUMN "updated_at", DROP COLUMN "created_at", DROP COLUMN "hire_date", DROP COLUMN "phone", DROP COLUMN "employee_type"');
  }
}
