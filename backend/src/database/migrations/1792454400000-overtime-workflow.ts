import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OvertimeWorkflow1792454400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE overtime_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES employees(id),
      submitted_by uuid NOT NULL REFERENCES users(id), submission_id uuid NOT NULL,
      work_date date NOT NULL, requested_minutes integer NOT NULL CHECK(requested_minutes BETWEEN 1 AND 1440),
      reason text NOT NULL CHECK(length(btrim(reason))>=5), work_content text NOT NULL CHECK(length(btrim(work_content))>=5),
      status varchar(30) NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','APPROVED','REJECTED')),
      approval_stage varchar(30) NOT NULL DEFAULT 'WAITING_ROUTING' CHECK(approval_stage IN ('WAITING_ROUTING','LEADER_CONFIRMATION','HEAD_APPROVAL','COMPLETED')),
      workflow_team_id uuid REFERENCES organization_teams(id), leader_user_id uuid REFERENCES users(id), head_user_id uuid REFERENCES users(id),
      route_version integer NOT NULL DEFAULT 0, confirmed_by uuid REFERENCES users(id), confirmed_at timestamptz, confirmation_note text,
      reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, review_note text,
      decision_method varchar(20) CHECK(decision_method IN ('ROUTED','ADMIN_FALLBACK')), admin_override_reason text,
      submitted_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(submitted_by,submission_id)
    );
    CREATE INDEX overtime_date_status ON overtime_requests(work_date,status,employee_id);
    CREATE UNIQUE INDEX overtime_active_daily ON overtime_requests(employee_id,work_date) WHERE status IN ('SUBMITTED','APPROVED');
    CREATE TABLE overtime_approval_routes (
      employee_id uuid PRIMARY KEY REFERENCES employees(id), team_id uuid NOT NULL REFERENCES organization_teams(id),
      leader_user_id uuid NOT NULL REFERENCES users(id), head_user_id uuid NOT NULL REFERENCES users(id),
      version integer NOT NULL DEFAULT 1, reason text NOT NULL, updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO organization_catalog_usage(catalog_table,catalog_id)
      SELECT 'organization_teams',workflow_team_id FROM overtime_requests WHERE workflow_team_id IS NOT NULL ON CONFLICT DO NOTHING;`);
    // Extend the existing catalogue history protection for these new FK sources.
    await runner.query(`CREATE TRIGGER overtime_team_usage AFTER INSERT OR UPDATE OF workflow_team_id ON overtime_requests FOR EACH ROW EXECUTE FUNCTION remember_organization_catalog_usage('organization_teams','workflow_team_id');
      CREATE TRIGGER overtime_route_team_usage AFTER INSERT OR UPDATE OF team_id ON overtime_approval_routes FOR EACH ROW EXECUTE FUNCTION remember_organization_catalog_usage('organization_teams','team_id');`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query('SELECT EXISTS(SELECT 1 FROM overtime_requests) OR EXISTS(SELECT 1 FROM overtime_approval_routes) AS used') as Array<{ used: boolean }>;
    if (row.used) throw new Error('Export/migrate OT data before rollback.');
    await runner.query('DROP TABLE overtime_requests; DROP TABLE overtime_approval_routes;');
  }
}
