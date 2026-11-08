import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportingReportSnapshots1792972800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Existing revisions stay untouched. NULL explicitly means detail was not captured.
    await runner.query(`ALTER TABLE attendance_report_snapshots ADD COLUMN supporting_reports jsonb
      CHECK(supporting_reports IS NULL OR jsonb_typeof(supporting_reports)='object')`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query('SELECT EXISTS(SELECT 1 FROM attendance_report_snapshots WHERE supporting_reports IS NOT NULL) AS exists') as Array<{ exists: boolean }>;
    if (row?.exists) throw new Error('Cannot discard captured supporting report history');
    await runner.query('ALTER TABLE attendance_report_snapshots DROP COLUMN supporting_reports');
  }
}
