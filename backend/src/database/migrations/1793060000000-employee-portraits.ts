import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeePortraits1793060000000 implements MigrationInterface {
  name = 'EmployeePortraits1793060000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE employee_portraits (
      employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      version uuid NOT NULL,
      portrait bytea NOT NULL CHECK(octet_length(portrait) BETWEEN 1 AND 786432),
      thumbnail bytea NOT NULL CHECK(octet_length(thumbnail) BETWEEN 1 AND 40960),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid NOT NULL REFERENCES users(id)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query('SELECT count(*)::int AS count FROM employee_portraits') as { count: number }[];
    if (row.count) throw new Error('Export employee portraits before reverting this migration.');
    await runner.query('DROP TABLE employee_portraits');
  }
}
