import type { DataSource, Migration } from 'typeorm';

export async function runPendingMigrations(db: DataSource): Promise<Migration[]> {
  const lease = db.createQueryRunner();
  let locked = false;
  try {
    await lease.connect();
    const [result] = await lease.query("SELECT pg_try_advisory_lock(hashtext('thien-minh-schema-migrations')) AS locked") as unknown as Array<{ locked: boolean }>;
    if (!result.locked) throw new Error('MIGRATION_ALREADY_RUNNING');
    locked = true;
    return await db.runMigrations({ transaction: 'all' });
  } finally {
    if (locked) await lease.query("SELECT pg_advisory_unlock(hashtext('thien-minh-schema-migrations'))");
    await lease.release();
  }
}
