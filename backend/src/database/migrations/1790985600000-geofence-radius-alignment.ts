import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GeofenceRadiusAlignment1790985600000 implements MigrationInterface {
  name = 'GeofenceRadiusAlignment1790985600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "office_locations" DROP CONSTRAINT "chk_office_radius_customer_limit"`);
    await queryRunner.query(`ALTER TABLE "office_locations" ALTER COLUMN "radius_meters" SET DEFAULT 100`);
    await queryRunner.query(`UPDATE "office_locations" SET "radius_meters"=100 WHERE "radius_meters"=50`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD CONSTRAINT "chk_office_radius_customer_limit" CHECK ("radius_meters" <= 100)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "office_locations" DROP CONSTRAINT "chk_office_radius_customer_limit"`);
    await queryRunner.query(`UPDATE "office_locations" SET "radius_meters"=LEAST("radius_meters", 50)`);
    await queryRunner.query(`ALTER TABLE "office_locations" ALTER COLUMN "radius_meters" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "office_locations" ADD CONSTRAINT "chk_office_radius_customer_limit" CHECK ("radius_meters" <= 50)`);
  }
}
