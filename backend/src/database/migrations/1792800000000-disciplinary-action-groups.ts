import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DisciplinaryActionGroups1792800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE disciplinary_action_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id uuid NOT NULL UNIQUE,
      target_type varchar(20) NOT NULL CHECK(target_type IN ('TEAM','DEPARTMENT')),
      team_id uuid REFERENCES organization_teams(id),
      department_id uuid REFERENCES departments(id),
      target_name varchar(300) NOT NULL,
      selected_members jsonb NOT NULL CHECK(jsonb_typeof(selected_members)='array' AND jsonb_array_length(selected_members)>0),
      title varchar(200) NOT NULL, action_type varchar(30) NOT NULL CHECK(action_type IN ('WARNING','SUSPENSION','DISCIPLINARY_ACTION')),
      reason text NOT NULL, decision text NOT NULL, effective_from date NOT NULL, effective_to date,
      status varchar(20) NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','REVOKED')),
      issued_by uuid NOT NULL REFERENCES users(id), issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      revoked_by uuid REFERENCES users(id), revoked_at timestamptz, revocation_reason text,
      CHECK((target_type='TEAM' AND team_id IS NOT NULL AND department_id IS NULL) OR (target_type='DEPARTMENT' AND department_id IS NOT NULL AND team_id IS NULL)),
      CHECK(effective_to IS NULL OR effective_to>=effective_from),
      CHECK(action_type<>'SUSPENSION' OR effective_to IS NOT NULL),
      CHECK((status='ISSUED' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(btrim(revocation_reason))>=5))
    )`);
    await queryRunner.query(`ALTER TABLE employee_disciplinary_actions ADD COLUMN group_id uuid REFERENCES disciplinary_action_groups(id);
      CREATE UNIQUE INDEX disciplinary_group_employee_unique ON employee_disciplinary_actions(group_id,employee_id) WHERE group_id IS NOT NULL;
      CREATE TRIGGER disciplinary_group_team_usage AFTER INSERT OR UPDATE OF team_id ON disciplinary_action_groups FOR EACH ROW EXECUTE FUNCTION remember_organization_catalog_usage('organization_teams','team_id');
      CREATE TRIGGER disciplinary_group_department_usage AFTER INSERT OR UPDATE OF department_id ON disciplinary_action_groups FOR EACH ROW EXECUTE FUNCTION remember_organization_catalog_usage('departments','department_id')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [row] = await queryRunner.query('SELECT EXISTS(SELECT 1 FROM disciplinary_action_groups) AS exists') as Array<{ exists: boolean }>;
    if (row?.exists) throw new Error('Cannot remove collective disciplinary history');
    await queryRunner.query('ALTER TABLE employee_disciplinary_actions DROP COLUMN group_id; DROP TABLE disciplinary_action_groups');
  }
}
