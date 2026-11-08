import type { DataSource, MigrationInterface } from 'typeorm';
import { databaseMigrations } from './migration-registry.js';

// TypeORM showMigrations() can create its ledger. Operational GETs must not write.
export async function hasPendingMigrations(reader: Pick<DataSource, 'query'>): Promise<boolean> {
  const [table] = await reader.query<Array<{ present: boolean }>>("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present");
  if (!table.present) return true;
  const rows = await reader.query<Array<{ name: string }>>('SELECT name FROM public.schema_migrations');
  const applied = new Set(rows.map(row => row.name));
  return databaseMigrations.some(migration => !applied.has((new migration() as MigrationInterface).name ?? migration.name));
}
