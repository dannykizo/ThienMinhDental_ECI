import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeavePoliciesBalances1791331200000 implements MigrationInterface {
  name = 'LeavePoliciesBalances1791331200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "leave_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(30) NOT NULL UNIQUE,
        "name" varchar(120) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "balance_tracking_enabled" boolean NOT NULL DEFAULT false,
        "annual_entitlement_minutes" integer NOT NULL DEFAULT 0 CHECK ("annual_entitlement_minutes" >= 0),
        "day_minutes" integer NOT NULL DEFAULT 480 CHECK ("day_minutes" BETWEEN 1 AND 1440),
        "carry_over_enabled" boolean NOT NULL DEFAULT false,
        "max_carry_over_minutes" integer NOT NULL DEFAULT 0 CHECK ("max_carry_over_minutes" >= 0),
        "allow_half_day" boolean NOT NULL DEFAULT false,
        "allow_hourly" boolean NOT NULL DEFAULT false,
        "allow_approved_cancellation" boolean NOT NULL DEFAULT false,
        "minimum_notice_days" integer NOT NULL DEFAULT 0 CHECK ("minimum_notice_days" BETWEEN 0 AND 365),
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO "leave_policies" ("code","name") VALUES
        ('ANNUAL','Phép năm'),
        ('SICK','Nghỉ bệnh'),
        ('UNPAID','Nghỉ không lương'),
        ('OTHER','Nghỉ khác')
    `);
    await queryRunner.query(`
      INSERT INTO "leave_policies" ("code","name")
      SELECT DISTINCT "leave_type", "leave_type"
      FROM "leave_requests"
      WHERE "leave_type" NOT IN ('ANNUAL','SICK','UNPAID','OTHER')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_leave_balances" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
        "policy_id" uuid NOT NULL REFERENCES "leave_policies"("id"),
        "balance_year" integer NOT NULL CHECK ("balance_year" BETWEEN 2000 AND 2200),
        "entitlement_minutes" integer NOT NULL CHECK ("entitlement_minutes" >= 0),
        "carry_over_minutes" integer NOT NULL DEFAULT 0 CHECK ("carry_over_minutes" >= 0),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_employee_leave_balance_year" UNIQUE ("employee_id","policy_id","balance_year")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "leave_balance_adjustments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "balance_id" uuid NOT NULL REFERENCES "employee_leave_balances"("id") ON DELETE CASCADE,
        "delta_minutes" integer NOT NULL CHECK ("delta_minutes" <> 0),
        "reason" text NOT NULL,
        "created_by" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "policy_id" uuid REFERENCES "leave_policies"("id")`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "duration_type" varchar(20) NOT NULL DEFAULT 'FULL_DAY'`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "half_day_period" varchar(10)`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "start_time" time`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "end_time" time`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "requested_minutes" integer NOT NULL DEFAULT 480`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "cancelled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "cancelled_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD COLUMN "cancellation_reason" text`);
    await queryRunner.query(`UPDATE "leave_requests" l SET "policy_id"=p.id FROM "leave_policies" p WHERE p.code=l.leave_type`);
    await queryRunner.query(`UPDATE "leave_requests" SET "requested_minutes"=("end_date"-"start_date"+1)*480`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ALTER COLUMN "policy_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_duration_type_check" CHECK ("duration_type" IN ('FULL_DAY','HALF_DAY','HOURS'))`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_half_day_period_check" CHECK ("half_day_period" IS NULL OR "half_day_period" IN ('AM','PM'))`);
    await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requested_minutes_check" CHECK ("requested_minutes" > 0)`);
    await queryRunner.query(`CREATE INDEX "idx_leave_balance_policy_year" ON "employee_leave_balances"("policy_id","balance_year")`);
    await queryRunner.query(`CREATE INDEX "idx_leave_adjustment_balance" ON "leave_balance_adjustments"("balance_id","created_at" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_leave_adjustment_balance"`);
    await queryRunner.query(`DROP INDEX "idx_leave_balance_policy_year"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requested_minutes_check"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_half_day_period_check"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_duration_type_check"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "cancellation_reason"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "cancelled_at"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "cancelled_by"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "requested_minutes"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "end_time"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "start_time"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "half_day_period"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "duration_type"`);
    await queryRunner.query(`ALTER TABLE "leave_requests" DROP COLUMN "policy_id"`);
    await queryRunner.query(`DROP TABLE "leave_balance_adjustments"`);
    await queryRunner.query(`DROP TABLE "employee_leave_balances"`);
    await queryRunner.query(`DROP TABLE "leave_policies"`);
  }
}
