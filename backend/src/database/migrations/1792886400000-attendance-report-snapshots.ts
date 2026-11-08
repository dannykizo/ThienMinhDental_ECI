import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceReportSnapshots1792886400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // No employee/catalog FK: an approved historical report survives R3 deletion.
    // Do not fabricate snapshots for periods locked before this migration.
    await runner.query(`CREATE TABLE attendance_report_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      period_id uuid NOT NULL REFERENCES attendance_periods(id),
      revision integer NOT NULL CHECK(revision > 0),
      format_version integer NOT NULL DEFAULT 1 CHECK(format_version=1),
      rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array'),
      summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object'),
      locked_by uuid NOT NULL REFERENCES users(id),
      locked_by_name text NOT NULL,
      locked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      lock_reason text,
      UNIQUE(period_id,revision)
    )`);
    await runner.query(`CREATE FUNCTION protect_attendance_report_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Attendance report snapshots are immutable' USING ERRCODE='23514'; END $$;
      CREATE TRIGGER attendance_report_snapshot_immutable BEFORE UPDATE OR DELETE ON attendance_report_snapshots
      FOR EACH ROW EXECUTE FUNCTION protect_attendance_report_snapshot()`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query('SELECT EXISTS(SELECT 1 FROM attendance_report_snapshots) AS exists') as Array<{ exists: boolean }>;
    if (row?.exists) throw new Error('Cannot discard approved attendance report history');
    await runner.query('DROP TABLE attendance_report_snapshots; DROP FUNCTION protect_attendance_report_snapshot()');
  }
}
