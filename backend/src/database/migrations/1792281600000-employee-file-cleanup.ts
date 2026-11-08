import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeFileCleanup1792281600000 implements MigrationInterface {
  name = 'EmployeeFileCleanup1792281600000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE employee_file_cleanup (
      storage_kind varchar(20) NOT NULL CHECK(storage_kind IN ('ATTENDANCE','TRIP')),
      filename varchar(50) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(storage_kind,filename))`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query('SELECT count(*)::int AS count FROM employee_file_cleanup') as Array<{ count: number }>;
    if (row.count) throw new Error('Complete employee file cleanup before reverting migration');
    await runner.query('DROP TABLE employee_file_cleanup');
  }
}
