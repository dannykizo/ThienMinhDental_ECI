import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialFoundation1726358400000 implements MigrationInterface {
  name = 'InitialFoundation1726358400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(30) NOT NULL UNIQUE,
        "name" varchar(150) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "positions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(30) NOT NULL UNIQUE,
        "name" varchar(150) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(30) NOT NULL UNIQUE,
        "name" varchar(100) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL UNIQUE,
        "password_hash" varchar(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "employees" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_code" varchar(30) NOT NULL UNIQUE,
        "full_name" varchar(150) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "department_id" uuid NULL REFERENCES "departments"("id") ON DELETE SET NULL,
        "position_id" uuid NULL REFERENCES "positions"("id") ON DELETE SET NULL,
        "user_id" uuid NULL UNIQUE REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        PRIMARY KEY ("user_id", "role_id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "user_roles"');
    await queryRunner.query('DROP TABLE "employees"');
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TABLE "roles"');
    await queryRunner.query('DROP TABLE "positions"');
    await queryRunner.query('DROP TABLE "departments"');
  }
}
