import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationCatalogLifecycle1792195200000 implements MigrationInterface {
  name = 'OrganizationCatalogLifecycle1792195200000';

  async up(runner: QueryRunner): Promise<void> {
    // No FK to the catalogue: usage is a permanent fact even if a referencing
    // row is later replaced/removed. Includes ended/revoked historical records.
    await runner.query(`CREATE TABLE organization_catalog_usage (
      catalog_table text NOT NULL CHECK (catalog_table IN ('branches','departments','positions','organization_teams')),
      catalog_id uuid NOT NULL, first_used_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (catalog_table,catalog_id)
    )`);
    await runner.query(`CREATE FUNCTION remember_organization_catalog_usage() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE referenced_id uuid;
      BEGIN
        referenced_id := (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
        IF referenced_id IS NOT NULL THEN
          INSERT INTO organization_catalog_usage(catalog_table,catalog_id)
            VALUES (TG_ARGV[0],referenced_id) ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
      END $$`);
    // Discover all actual FK columns, including ON DELETE SET NULL/CASCADE.
    // Future migrations introducing new references must install this trigger too.
    await runner.query(`DO $$ DECLARE ref record; BEGIN
      FOR ref IN SELECT c.oid, c.conrelid::regclass AS source, target.relname AS target,
          a.attname AS column_name
        FROM pg_constraint c JOIN pg_class target ON target.oid=c.confrelid
        JOIN pg_namespace n ON n.oid=target.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
        WHERE c.contype='f' AND cardinality(c.conkey)=1 AND n.nspname='public'
          AND target.relname IN ('branches','departments','positions','organization_teams')
      LOOP
        EXECUTE format('INSERT INTO organization_catalog_usage(catalog_table,catalog_id)
          SELECT %L,%I FROM %s WHERE %I IS NOT NULL ON CONFLICT DO NOTHING',ref.target,ref.column_name,ref.source,ref.column_name);
        EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OF %I ON %s
          FOR EACH ROW EXECUTE FUNCTION remember_organization_catalog_usage(%L,%L)',
          'catalog_usage_'||ref.oid,ref.column_name,ref.source,ref.target,ref.column_name);
      END LOOP;
      -- Recover references removed before this migration from immutable audits.
      -- Own CREATE/UPDATE audits do not make an otherwise unused record "used".
      FOR ref IN SELECT * FROM (VALUES ('branches','ORGANIZATION_BRANCH'),
        ('departments','ORGANIZATION_DEPARTMENT'),('positions','ORGANIZATION_POSITION'),
        ('organization_teams','ORGANIZATION_TEAM')) AS t(target,resource_type)
      LOOP
        EXECUTE format('INSERT INTO organization_catalog_usage(catalog_table,catalog_id)
          SELECT %L,t.id FROM %I t WHERE EXISTS(SELECT 1 FROM configuration_audit_logs a
            WHERE NOT (a.resource_type=%L AND a.resource_id=t.id)
              AND (position(t.id::text in COALESCE(a.old_value::text,''''))>0
                OR position(t.id::text in COALESCE(a.new_value::text,''''))>0)) ON CONFLICT DO NOTHING',
          ref.target,ref.target,ref.resource_type);
      END LOOP;
    END $$`);
    // Defence in depth against direct SQL/cascade deletion of used catalogues.
    await runner.query(`CREATE FUNCTION protect_used_organization_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS(SELECT 1 FROM organization_catalog_usage WHERE catalog_table=TG_TABLE_NAME AND catalog_id=OLD.id) THEN
          RAISE EXCEPTION 'Organization catalogue has historical usage' USING ERRCODE='23503';
        END IF;
        RETURN OLD;
      END $$`);
    for (const table of ['branches', 'departments', 'positions', 'organization_teams']) {
      await runner.query(`CREATE TRIGGER protect_catalog_delete BEFORE DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION protect_used_organization_catalog()`);
    }
  }

  down(): Promise<void> {
    return Promise.reject(new Error('Export/migrate catalogue usage and audits before rollback; automatic rollback must not remove historical deletion protection.'));
  }
}
