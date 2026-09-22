import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessTripOperations1790380800000 implements MigrationInterface {
  name = 'BusinessTripOperations1790380800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_trips" ADD COLUMN "responsible_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "business_trips" ADD COLUMN "cancel_reason" text`);
    await queryRunner.query(`CREATE INDEX "idx_business_trips_responsible" ON "business_trips"("responsible_employee_id")`);
    await queryRunner.query(`
      UPDATE "business_trips" bt SET "responsible_employee_id" = (
        SELECT btm.employee_id FROM "business_trip_members" btm
        WHERE btm.business_trip_id=bt.id ORDER BY btm.employee_id LIMIT 1
      ) WHERE bt.responsible_employee_id IS NULL
    `);

    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "start_latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "start_longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "start_accuracy_meters" double precision`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "end_latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "end_longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "end_accuracy_meters" double precision`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "evidence_image_reference" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD COLUMN "evidence_captured_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD CONSTRAINT "chk_trip_member_status" CHECK ("participation_status" IN ('ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'))`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD CONSTRAINT "chk_trip_member_start_coordinates" CHECK (("start_latitude" IS NULL AND "start_longitude" IS NULL) OR ("start_latitude" BETWEEN -90 AND 90 AND "start_longitude" BETWEEN -180 AND 180))`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" ADD CONSTRAINT "chk_trip_member_end_coordinates" CHECK (("end_latitude" IS NULL AND "end_longitude" IS NULL) OR ("end_latitude" BETWEEN -90 AND 90 AND "end_longitude" BETWEEN -180 AND 180))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP CONSTRAINT "chk_trip_member_end_coordinates"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP CONSTRAINT "chk_trip_member_start_coordinates"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP CONSTRAINT "chk_trip_member_status"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "evidence_captured_at"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "evidence_image_reference"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "end_accuracy_meters"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "end_longitude"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "end_latitude"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "start_accuracy_meters"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "start_longitude"`);
    await queryRunner.query(`ALTER TABLE "business_trip_members" DROP COLUMN "start_latitude"`);
    await queryRunner.query(`DROP INDEX "idx_business_trips_responsible"`);
    await queryRunner.query(`ALTER TABLE "business_trips" DROP COLUMN "cancel_reason"`);
    await queryRunner.query(`ALTER TABLE "business_trips" DROP COLUMN "responsible_employee_id"`);
  }
}
