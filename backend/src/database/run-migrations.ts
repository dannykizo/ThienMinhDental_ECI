import { applicationDataSource } from './data-source.js';
import { runPendingMigrations } from './migration-runner.js';

async function runMigrations(): Promise<void> {
  try {
    await applicationDataSource.initialize();
    const migrations = await runPendingMigrations(applicationDataSource);
    console.log(`Applied ${migrations.length} migration(s).`);
  } finally {
    if (applicationDataSource.isInitialized) await applicationDataSource.destroy();
  }
}

void runMigrations().catch(() => {
  console.error('Migration failed. Startup refused; preserve the backup and investigate before retrying.');
  process.exitCode = 1;
});
