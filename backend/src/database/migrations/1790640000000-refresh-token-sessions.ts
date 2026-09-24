import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokenSessions1790640000000 implements MigrationInterface {
  name = 'RefreshTokenSessions1790640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_sessions" ADD COLUMN "last_seen_at" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" ADD COLUMN "refresh_token_hash" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" ADD COLUMN "previous_refresh_token_hash" varchar(64)`);
    await queryRunner.query(`UPDATE "auth_sessions" SET "revoked_at"=now(), "revoke_reason"='TOKEN_POLICY_CHANGED' WHERE "revoked_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_sessions" DROP COLUMN "previous_refresh_token_hash"`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" DROP COLUMN "refresh_token_hash"`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" DROP COLUMN "last_seen_at"`);
  }
}
