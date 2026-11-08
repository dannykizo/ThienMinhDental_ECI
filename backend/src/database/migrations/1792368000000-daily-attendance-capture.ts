import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyAttendanceCapture1792368000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE attendance_checkin_captures (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id),
      user_id uuid NOT NULL REFERENCES users(id),
      attendance_type varchar(30) NOT NULL CHECK(attendance_type IN ('OFFICE','BUSINESS_TRIP')),
      field_work_content varchar(2000),
      latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
      longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
      accuracy_meters double precision NOT NULL CHECK(accuracy_meters BETWEEN 0 AND 10000),
      mock_location_signal boolean NOT NULL,
      prepared_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
      CHECK(attendance_type='OFFICE' OR (field_work_content IS NOT NULL AND length(trim(field_work_content)) BETWEEN 5 AND 2000))
    )`);
    await runner.query(`ALTER TABLE attendance_events
      ADD COLUMN checkin_capture_id uuid REFERENCES attendance_checkin_captures(id),
      ADD COLUMN evidence_image_reference varchar(500),
      ADD COLUMN field_work_content varchar(2000),
      ADD COLUMN daily_policy boolean NOT NULL DEFAULT false`);
    // Partial indexes protect new writes without erasing historic repeated events.
    await runner.query(`CREATE UNIQUE INDEX attendance_daily_pair ON attendance_events(employee_id,((server_time AT TIME ZONE 'Asia/Bangkok')::date),event_type) WHERE daily_policy`);
    await runner.query(`CREATE UNIQUE INDEX attendance_capture_once ON attendance_events(checkin_capture_id) WHERE checkin_capture_id IS NOT NULL`);
    await runner.query(`CREATE INDEX attendance_captures_employee ON attendance_checkin_captures(employee_id)`);
    await runner.query(`ALTER TABLE attendance_events ADD CONSTRAINT attendance_daily_photo CHECK(NOT daily_policy OR event_type<>'CHECK_IN' OR (checkin_capture_id IS NOT NULL AND evidence_image_reference IS NOT NULL))`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [used] = await runner.query(`SELECT EXISTS(SELECT 1 FROM attendance_checkin_captures) OR EXISTS(SELECT 1 FROM attendance_events WHERE daily_policy) AS used`) as Array<{ used: boolean }>;
    if (used.used) throw new Error('Export/migrate daily attendance and capture data before rollback');
    await runner.query('DROP INDEX attendance_daily_pair');
    await runner.query('DROP INDEX attendance_capture_once');
    await runner.query('ALTER TABLE attendance_events DROP CONSTRAINT attendance_daily_photo, DROP COLUMN daily_policy, DROP COLUMN field_work_content, DROP COLUMN evidence_image_reference, DROP COLUMN checkin_capture_id');
    await runner.query('DROP TABLE attendance_checkin_captures');
  }
}
