import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminSecurity1791936000000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE admin_security_profiles (
        user_id uuid PRIMARY KEY REFERENCES users(id), pin_hash varchar(255),
        version integer NOT NULL DEFAULT 1 CHECK(version>0), failed_attempts integer NOT NULL DEFAULT 0,
        blocked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE admin_security_unlocks (
        session_id uuid PRIMARY KEY REFERENCES auth_sessions(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id), version integer NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE TABLE admin_recovery_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
        code_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
        used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX admin_recovery_codes_user ON admin_recovery_codes(user_id);
      CREATE TABLE admin_handovers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_user_id uuid NOT NULL REFERENCES users(id),
        target_user_id uuid NOT NULL REFERENCES users(id), token_hash varchar(64) NOT NULL UNIQUE,
        source_version integer NOT NULL, expires_at timestamptz NOT NULL,
        accepted_at timestamptz, cancelled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
        failed_attempts integer NOT NULL DEFAULT 0, blocked_until timestamptz,
        CHECK(source_user_id<>target_user_id)
      );
      CREATE UNIQUE INDEX admin_handovers_one_pending ON admin_handovers(source_user_id)
        WHERE accepted_at IS NULL AND cancelled_at IS NULL;
    `);
  }
  async down(db: QueryRunner): Promise<void> {
    const [row] = await db.query(`SELECT EXISTS(
      SELECT 1 FROM admin_security_profiles WHERE pin_hash IS NOT NULL
      UNION ALL SELECT 1 FROM admin_handovers) AS exists`) as Array<{ exists: boolean }>;
    if (row?.exists) throw new Error('ADMIN_SECURITY_ROLLBACK_REQUIRES_EXPLICIT_DATA_MIGRATION');
    await db.query('DROP TABLE admin_handovers, admin_recovery_codes, admin_security_unlocks, admin_security_profiles');
  }
}
