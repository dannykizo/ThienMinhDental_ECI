import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalRoles1790812800000 implements MigrationInterface {
  name = 'CanonicalRoles1790812800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles" ("code", "name") VALUES
        ('ADMIN', 'Quản trị viên'),
        ('CHIEF_ACCOUNTANT', 'Kế toán trưởng'),
        ('AREA_MANAGER', 'Quản lý khu vực'),
        ('MANAGER', 'Quản lý (tương thích)'),
        ('EMPLOYEE', 'Nhân viên')
      ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "code" IN ('ADMIN', 'MANAGER', 'EMPLOYEE')
        AND NOT EXISTS (
          SELECT 1 FROM "user_roles" ur WHERE ur.role_id = "roles".id
        )
    `);
  }
}
