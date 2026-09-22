import { applicationDataSource } from './data-source.js';

async function runMigrations(): Promise<void> {
  await applicationDataSource.initialize();
  const migrations = await applicationDataSource.runMigrations();
  console.log(`Applied ${migrations.length} migration(s).`);
  await applicationDataSource.destroy();
}

void runMigrations();
