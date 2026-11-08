import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceDeviceProof1792540800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE attendance_abuse_budgets (
      user_id uuid NOT NULL REFERENCES users(id),
      bucket varchar(20) NOT NULL CHECK(bucket IN ('CAPTURE','UPLOAD','EVENT')),
      window_start timestamptz NOT NULL,
      attempts integer NOT NULL CHECK(attempts>=1),
      PRIMARY KEY(user_id,bucket)
    )`);
    await runner.query(`CREATE TABLE attendance_devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      device_id varchar(120) NOT NULL,
      device_name varchar(120) NOT NULL,
      public_key text NOT NULL,
      fingerprint varchar(64) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REVOKED')),
      created_at timestamptz NOT NULL DEFAULT now(),
      decided_at timestamptz,
      decided_by uuid REFERENCES users(id),
      decision_reason varchar(2000)
    )`);
    await runner.query(`CREATE UNIQUE INDEX attendance_device_active ON attendance_devices(user_id) WHERE status='ACTIVE'`);
    await runner.query(`CREATE UNIQUE INDEX attendance_device_pending ON attendance_devices(user_id) WHERE status='PENDING'`);
    await runner.query(`CREATE TABLE attendance_device_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_binding_id uuid NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
      payload text NOT NULL,
      input_hash varchar(64) NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    )`);
    await runner.query(`CREATE INDEX attendance_challenge_device ON attendance_device_challenges(device_binding_id)`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query(`SELECT EXISTS(SELECT 1 FROM attendance_devices) AS used`) as Array<{used:boolean}>;
    if (row.used) throw new Error('Export and explicitly migrate device decisions before rollback; do not silently disable attendance proof');
    await runner.query('DROP TABLE attendance_device_challenges');
    await runner.query('DROP TABLE attendance_devices');
    await runner.query('DROP TABLE attendance_abuse_budgets');
  }
}
