import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeDisciplinaryActions1791244800000
  implements MigrationInterface
{
  name = 'EmployeeDisciplinaryActions1791244800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employee_disciplinary_actions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
        "action_type" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "title" varchar(200) NOT NULL,
        "reason" text NOT NULL,
        "decision" text NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "created_by" uuid NOT NULL REFERENCES "users"("id"),
        "issued_by" uuid REFERENCES "users"("id"),
        "issued_at" timestamptz,
        "revoked_by" uuid REFERENCES "users"("id"),
        "revoked_at" timestamptz,
        "revocation_reason" text,
        "announcement_id" uuid REFERENCES "announcements"("id") ON DELETE SET NULL,
        "revocation_announcement_id" uuid REFERENCES "announcements"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "disciplinary_action_type_check" CHECK ("action_type" IN ('WARNING','SUSPENSION','DISCIPLINARY_ACTION')),
        CONSTRAINT "disciplinary_action_status_check" CHECK ("status" IN ('DRAFT','ISSUED','REVOKED')),
        CONSTRAINT "disciplinary_action_period_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "disciplinary_suspension_period_check" CHECK ("action_type" <> 'SUSPENSION' OR "effective_to" IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_disciplinary_employee_status" ON "employee_disciplinary_actions"("employee_id", "status", "effective_from" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_disciplinary_created_at" ON "employee_disciplinary_actions"("created_at" DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_disciplinary_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_disciplinary_employee_status"`);
    await queryRunner.query(`DROP TABLE "employee_disciplinary_actions"`);
  }
}
