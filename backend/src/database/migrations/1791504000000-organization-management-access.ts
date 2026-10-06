import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationManagementAccess1791504000000 implements MigrationInterface {
  name = 'OrganizationManagementAccess1791504000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE organization_teams (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      department_id uuid NOT NULL REFERENCES departments(id),
      code varchar(30) NOT NULL CHECK (code ~ '^[A-Z0-9_-]+$'),
      name varchar(150) NOT NULL CHECK (length(trim(name)) > 0),
      is_active boolean NOT NULL DEFAULT true,
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(department_id, code)
    )`);
    await runner.query(`CREATE TABLE organization_team_memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id uuid NOT NULL REFERENCES organization_teams(id),
      employee_id uuid NOT NULL REFERENCES employees(id),
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      ended_by uuid REFERENCES users(id),
      ended_at timestamptz,
      end_reason varchar(500),
      CHECK ((ended_at IS NULL AND ended_by IS NULL AND end_reason IS NULL)
        OR (ended_at IS NOT NULL AND ended_by IS NOT NULL AND length(trim(end_reason)) > 0))
    )`);
    await runner.query(`CREATE UNIQUE INDEX uq_current_team_member ON organization_team_memberships(team_id,employee_id) WHERE ended_at IS NULL`);
    await runner.query(`CREATE INDEX idx_team_membership_employee ON organization_team_memberships(employee_id)`);
    await runner.query(`CREATE TABLE organization_management_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      role_code varchar(30) NOT NULL CHECK (role_code IN ('DEPARTMENT_HEAD','TEAM_LEADER')),
      department_id uuid REFERENCES departments(id),
      team_id uuid REFERENCES organization_teams(id),
      appointment_type varchar(20) NOT NULL CHECK (appointment_type IN ('TEMPORARY','OFFICIAL')),
      valid_from timestamptz NOT NULL,
      valid_until timestamptz,
      reason varchar(500) NOT NULL CHECK (length(trim(reason)) > 0),
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_by uuid REFERENCES users(id),
      revoked_at timestamptz,
      revocation_reason varchar(500),
      CHECK (valid_until IS NULL OR valid_until > valid_from),
      CHECK ((role_code='DEPARTMENT_HEAD' AND department_id IS NOT NULL AND team_id IS NULL)
        OR (role_code='TEAM_LEADER' AND team_id IS NOT NULL AND department_id IS NULL)),
      CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
        OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(trim(revocation_reason)) > 0))
    )`);
    await runner.query(`CREATE INDEX idx_management_grant_user ON organization_management_grants(user_id) WHERE revoked_at IS NULL`);
    await runner.query(`ALTER TABLE organization_team_memberships ADD CONSTRAINT chk_team_end_reason
      CHECK (ended_at IS NULL OR end_reason IS NOT NULL)`);
    await runner.query(`ALTER TABLE organization_management_grants ADD CONSTRAINT chk_grant_revocation_reason
      CHECK (revoked_at IS NULL OR revocation_reason IS NOT NULL)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const [row] = await runner.query(`SELECT EXISTS(SELECT 1 FROM organization_teams)
      OR EXISTS(SELECT 1 FROM organization_management_grants) AS populated`) as Array<{ populated: boolean }>;
    if (row.populated) throw new Error('Export/migrate PQ1 organization data before reverting; rollback must not delete organizational history.');
    await runner.query('DROP TABLE organization_management_grants');
    await runner.query('DROP TABLE organization_team_memberships');
    await runner.query('DROP TABLE organization_teams');
  }
}
