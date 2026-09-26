import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessTripCustomerManagement1791072000000
  implements MigrationInterface
{
  name = 'BusinessTripCustomerManagement1791072000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_customers_active_name" ON "customers"("is_active", "name")`,
    );
    await queryRunner.query(
      `CREATE TABLE "business_trip_code_counters" ("period_key" varchar(6) PRIMARY KEY, "last_value" int NOT NULL CHECK ("last_value" > 0))`,
    );
    await queryRunner.query(
      `INSERT INTO "business_trip_code_counters" ("period_key", "last_value")
       SELECT substring("code" FROM 4 FOR 6), MAX(substring("code" FROM 11)::int)
       FROM "business_trips"
       WHERE "code" ~ '^CT-[0-9]{6}-[0-9]{4,}$'
       GROUP BY substring("code" FROM 4 FOR 6)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "business_trip_code_counters"`);
    await queryRunner.query(`DROP INDEX "idx_customers_active_name"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "created_at"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "is_active"`);
  }
}
