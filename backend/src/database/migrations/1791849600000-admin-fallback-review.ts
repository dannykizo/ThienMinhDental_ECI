import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminFallbackReview1791849600000 implements MigrationInterface {
  name = 'AdminFallbackReview1791849600000';
  async up(runner: QueryRunner): Promise<void> {
    for (const table of ['leave_requests', 'attendance_explanation_requests']) {
      await runner.query(`ALTER TABLE ${table}
        ADD COLUMN decision_method varchar(20), ADD COLUMN admin_override_reason text,
        ADD CONSTRAINT chk_${table}_decision_method CHECK(decision_method IN ('ROUTED','ADMIN_FALLBACK')),
        ADD CONSTRAINT chk_${table}_override_reason CHECK(
          (decision_method IS NOT DISTINCT FROM 'ADMIN_FALLBACK' AND admin_override_reason IS NOT NULL AND length(trim(admin_override_reason))>=5 AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
          OR (decision_method IS DISTINCT FROM 'ADMIN_FALLBACK' AND admin_override_reason IS NULL))`);
    }
  }
  async down(runner: QueryRunner): Promise<void> {
    for (const table of ['leave_requests', 'attendance_explanation_requests']) {
      const [row] = await runner.query(`SELECT count(*)::int AS count FROM ${table} WHERE decision_method IS NOT NULL`) as Array<{count:number}>;
      if (row.count) throw new Error('Export/migrate decision provenance before reverting Admin fallback review.');
    }
    for (const table of ['leave_requests', 'attendance_explanation_requests']) {
      await runner.query(`ALTER TABLE ${table} DROP CONSTRAINT chk_${table}_decision_method, DROP CONSTRAINT chk_${table}_override_reason, DROP COLUMN admin_override_reason, DROP COLUMN decision_method`);
    }
  }
}
