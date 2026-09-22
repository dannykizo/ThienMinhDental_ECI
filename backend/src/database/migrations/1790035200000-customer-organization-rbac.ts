import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerOrganizationRbac1790035200000
  implements MigrationInterface
{
  name = 'CustomerOrganizationRbac1790035200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(30) NOT NULL UNIQUE,
        "name" varchar(150) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      INSERT INTO "branches" ("code", "name") VALUES
        ('HCM', 'Chi nhánh TP.HCM'),
        ('HN', 'Chi nhánh Hà Nội')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE "employee_organization_assignments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
        "department_id" uuid NOT NULL REFERENCES "departments"("id"),
        "position_id" uuid REFERENCES "positions"("id") ON DELETE SET NULL,
        "manager_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_employee_org_employee" ON "employee_organization_assignments"("employee_id")`);
    await queryRunner.query(`CREATE INDEX "idx_employee_org_branch" ON "employee_organization_assignments"("branch_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_employee_primary_active_assignment" ON "employee_organization_assignments"("employee_id") WHERE "is_primary" = true AND "effective_to" IS NULL`);
    await queryRunner.query(`
      CREATE TABLE "user_branch_scopes" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        PRIMARY KEY ("user_id", "branch_id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "roles" ("code", "name") VALUES
        ('CHIEF_ACCOUNTANT', 'Kế toán trưởng'),
        ('AREA_MANAGER', 'Quản lý khu vực')
      ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name"
    `);
    await queryRunner.query(`
      INSERT INTO "employee_organization_assignments" (
        "employee_id", "branch_id", "department_id", "position_id",
        "is_primary", "effective_from"
      )
      SELECT e.id, b.id, e.department_id, e.position_id, true,
        COALESCE(e.hire_date, (now() AT TIME ZONE 'Asia/Bangkok')::date)
      FROM "employees" e
      CROSS JOIN "branches" b
      WHERE b.code = 'HCM' AND e.department_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "user_branch_scopes"');
    await queryRunner.query('DROP TABLE "employee_organization_assignments"');
    await queryRunner.query('DROP TABLE "branches"');
    await queryRunner.query(`DELETE FROM "roles" WHERE "code" IN ('CHIEF_ACCOUNTANT', 'AREA_MANAGER') AND NOT EXISTS (SELECT 1 FROM "user_roles" ur WHERE ur.role_id = "roles".id)`);
  }
}
