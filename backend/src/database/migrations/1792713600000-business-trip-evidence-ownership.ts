import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessTripEvidenceOwnership1792713600000 implements MigrationInterface {
  name = 'BusinessTripEvidenceOwnership1792713600000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE business_trip_evidence_uploads (
      evidence_id uuid PRIMARY KEY,
      filename varchar(50) NOT NULL UNIQUE,
      uploaded_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    // Only infer ownership from an unambiguous existing participation link.
    // Conflicting legacy references stay Admin-only; never rewrite historic decisions/photos.
    await runner.query(`WITH refs AS (
      SELECT substring(m.evidence_image_reference from '/([0-9A-Fa-f-]{36})[.]')::uuid AS evidence_id,
        substring(m.evidence_image_reference from '/([^/]+)$') AS filename,e.user_id
      FROM business_trip_members m JOIN employees e ON e.id=m.employee_id
      WHERE m.evidence_image_reference ~ '^/api/business-trips/evidence/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89aAbB][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}[.](jpg|png|webp)$'
    ) INSERT INTO business_trip_evidence_uploads(evidence_id,filename,uploaded_by)
      SELECT evidence_id,min(filename),CASE WHEN count(DISTINCT filename)=1 AND count(DISTINCT user_id)=1
        AND count(*) FILTER(WHERE user_id IS NULL)=0 THEN min(user_id::text)::uuid ELSE NULL END
      FROM refs GROUP BY evidence_id`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query('SELECT EXISTS(SELECT 1 FROM business_trip_evidence_uploads) AS used') as Array<{used:boolean}>;
    if(row.used) throw new Error('TRIP_EVIDENCE_OWNERSHIP_IN_USE: export/migrate before rollback');
    await runner.query('DROP TABLE business_trip_evidence_uploads');
  }
}
