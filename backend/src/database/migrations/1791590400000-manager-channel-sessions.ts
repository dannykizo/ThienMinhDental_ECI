import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ManagerChannelSessions1791590400000 implements MigrationInterface {
  name = 'ManagerChannelSessions1791590400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "uq_auth_sessions_one_active_per_user"');
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_auth_sessions_one_active_per_channel"
      ON auth_sessions(user_id,client_type) WHERE revoked_at IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Do not silently log users out to satisfy the old stronger constraint.
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM auth_sessions WHERE revoked_at IS NULL GROUP BY user_id HAVING count(*)>1)
      THEN RAISE EXCEPTION 'Revoke extra sessions explicitly before reverting channel sessions'; END IF;
    END $$`);
    await queryRunner.query('DROP INDEX "uq_auth_sessions_one_active_per_channel"');
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_auth_sessions_one_active_per_user"
      ON auth_sessions(user_id) WHERE revoked_at IS NULL`);
  }
}
