import { applicationDataSource } from './data-source.js';

async function revertMigration(): Promise<void> {
  await applicationDataSource.initialize();
  await applicationDataSource.undoLastMigration();
  console.log('Reverted the latest migration.');
  await applicationDataSource.destroy();
}

void revertMigration();
