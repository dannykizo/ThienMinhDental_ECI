import type { MigrationInterface, QueryRunner } from 'typeorm';

// Forward-only retirement: keep historical records, but retire all PIN-dependent authority.
export class RetireAdminPin1792108800000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      UPDATE admin_handovers SET cancelled_at=now()
        WHERE accepted_at IS NULL AND cancelled_at IS NULL;
      UPDATE admin_recovery_codes SET revoked_at=now()
        WHERE used_at IS NULL AND revoked_at IS NULL;
      UPDATE admin_security_unlocks SET expires_at=LEAST(expires_at,now());
      UPDATE admin_security_profiles SET pin_hash=NULL,version=version+1,
        failed_attempts=0,blocked_until=NULL,updated_at=now();
    `);
  }

  down(): Promise<never> {
    // Never restore retired codes/PINs or invitations by reversing a deployment.
    return Promise.reject(new Error('ADMIN_PIN_RETIREMENT_REQUIRES_EXPLICIT_REENABLE_MIGRATION'));
  }
}
