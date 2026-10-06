import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeExplanations1791417600000 implements MigrationInterface {
  name = 'EmployeeExplanations1791417600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE attendance_explanation_requests
      ALTER COLUMN due_at DROP NOT NULL,
      ALTER COLUMN requested_by DROP NOT NULL,
      ADD COLUMN source varchar(30) NOT NULL DEFAULT 'ADMIN_REQUEST',
      ADD COLUMN submitted_by uuid REFERENCES users(id),
      ADD COLUMN submission_id uuid,
      ADD CONSTRAINT chk_explanation_source CHECK (source IN ('ADMIN_REQUEST','EMPLOYEE')),
      ADD CONSTRAINT chk_employee_explanation CHECK (source <> 'EMPLOYEE' OR (submitted_by IS NOT NULL AND submission_id IS NOT NULL AND status <> 'REQUESTED'))`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_explanation_submission ON attendance_explanation_requests(submitted_by,submission_id) WHERE submission_id IS NOT NULL`);
    await queryRunner.query(`CREATE TABLE attendance_evidence_uploads (
      evidence_id uuid PRIMARY KEY,
      filename varchar(50) NOT NULL UNIQUE,
      uploaded_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    // Attribute referenced legacy images to their employee, without deleting files.
    await queryRunner.query(`INSERT INTO attendance_evidence_uploads(evidence_id,filename,uploaded_by)
      SELECT DISTINCT ON (x.evidence_image_reference) substring(x.evidence_image_reference from '/([0-9a-f-]{36})[.]')::uuid,
        substring(x.evidence_image_reference from '/([^/]+)$'), e.user_id
      FROM attendance_explanation_requests x JOIN employees e ON e.id=x.employee_id
      WHERE e.user_id IS NOT NULL AND x.evidence_image_reference ~ '^/api/attendance/evidence/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
      ORDER BY x.evidence_image_reference,x.created_at ON CONFLICT DO NOTHING`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Never invent legacy deadlines/requesters or erase employee submissions.
    const [row] = await queryRunner.query(`SELECT count(*)::text AS count FROM attendance_explanation_requests WHERE source='EMPLOYEE' OR due_at IS NULL OR requested_by IS NULL`) as unknown as Array<{ count: string }>;
    if (Number(row.count) > 0) throw new Error('Export/migrate employee explanations before reverting this migration.');
    await queryRunner.query('DROP TABLE attendance_evidence_uploads');
    await queryRunner.query('DROP INDEX uq_explanation_submission');
    await queryRunner.query(`ALTER TABLE attendance_explanation_requests DROP CONSTRAINT chk_employee_explanation,
      DROP CONSTRAINT chk_explanation_source, DROP COLUMN submission_id, DROP COLUMN submitted_by, DROP COLUMN source,
      ALTER COLUMN due_at SET NOT NULL, ALTER COLUMN requested_by SET NOT NULL`);
  }
}
