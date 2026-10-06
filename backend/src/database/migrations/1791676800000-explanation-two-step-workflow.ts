import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExplanationTwoStepWorkflow1791676800000 implements MigrationInterface {
  name = 'ExplanationTwoStepWorkflow1791676800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE attendance_explanation_routes (
      employee_id uuid PRIMARY KEY REFERENCES employees(id),
      team_id uuid NOT NULL REFERENCES organization_teams(id),
      leader_user_id uuid NOT NULL REFERENCES users(id),
      head_user_id uuid NOT NULL REFERENCES users(id),
      version integer NOT NULL DEFAULT 1 CHECK(version > 0),
      reason text NOT NULL CHECK(length(trim(reason)) >= 5),
      updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(leader_user_id <> head_user_id)
    )`);
    await queryRunner.query(`ALTER TABLE attendance_explanation_requests
      ADD COLUMN approval_stage varchar(30),
      ADD COLUMN workflow_team_id uuid REFERENCES organization_teams(id),
      ADD COLUMN leader_user_id uuid REFERENCES users(id),
      ADD COLUMN head_user_id uuid REFERENCES users(id),
      ADD COLUMN route_version integer NOT NULL DEFAULT 0 CHECK(route_version >= 0),
      ADD COLUMN confirmed_by uuid REFERENCES users(id),
      ADD COLUMN confirmed_at timestamptz,
      ADD COLUMN confirmation_note text,
      ADD CONSTRAINT chk_explanation_stage CHECK(approval_stage IN ('EMPLOYEE_RESPONSE','WAITING_ROUTING','LEADER_CONFIRMATION','HEAD_APPROVAL','COMPLETED')),
      ADD CONSTRAINT chk_explanation_route_shape CHECK((workflow_team_id IS NULL AND leader_user_id IS NULL AND head_user_id IS NULL) OR (workflow_team_id IS NOT NULL AND leader_user_id IS NOT NULL AND head_user_id IS NOT NULL AND leader_user_id <> head_user_id)),
      ADD CONSTRAINT chk_explanation_independent CHECK((submitted_by IS NULL OR (leader_user_id IS DISTINCT FROM submitted_by AND head_user_id IS DISTINCT FROM submitted_by)) AND (confirmed_by IS NULL OR head_user_id IS DISTINCT FROM confirmed_by)),
      ADD CONSTRAINT chk_explanation_confirmation CHECK((confirmed_by IS NULL AND confirmed_at IS NULL) OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
      ADD CONSTRAINT chk_explanation_step_order CHECK(approval_stage IS DISTINCT FROM 'HEAD_APPROVAL' OR (status='SUBMITTED' AND confirmed_by IS NOT NULL))`);
    // Pending legacy rows require real routing/confirmation, never invented actors.
    await queryRunner.query(`UPDATE attendance_explanation_requests SET approval_stage=CASE WHEN status='REQUESTED' THEN 'EMPLOYEE_RESPONSE' ELSE 'WAITING_ROUTING' END WHERE status IN ('REQUESTED','SUBMITTED')`);
    await queryRunner.query(`CREATE INDEX idx_explanation_workflow_assignees ON attendance_explanation_requests(leader_user_id,head_user_id) WHERE approval_stage IS NOT NULL`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const [row] = await queryRunner.query(`SELECT (SELECT count(*) FROM attendance_explanation_routes)+(SELECT count(*) FROM attendance_explanation_requests WHERE route_version>0 OR confirmed_by IS NOT NULL OR approval_stage='COMPLETED') AS count`) as Array<{ count: string }>;
    if (Number(row.count)) throw new Error('Export/migrate explanation routing and decisions before reverting PQ3.');
    await queryRunner.query(`DROP INDEX idx_explanation_workflow_assignees`);
    await queryRunner.query(`ALTER TABLE attendance_explanation_requests DROP CONSTRAINT chk_explanation_step_order, DROP CONSTRAINT chk_explanation_confirmation, DROP CONSTRAINT chk_explanation_independent, DROP CONSTRAINT chk_explanation_route_shape, DROP CONSTRAINT chk_explanation_stage,
      DROP COLUMN confirmation_note, DROP COLUMN confirmed_at, DROP COLUMN confirmed_by, DROP COLUMN route_version, DROP COLUMN head_user_id, DROP COLUMN leader_user_id, DROP COLUMN workflow_team_id, DROP COLUMN approval_stage`);
    await queryRunner.query(`DROP TABLE attendance_explanation_routes`);
  }
}
