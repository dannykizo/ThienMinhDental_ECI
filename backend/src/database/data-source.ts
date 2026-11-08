import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseEntities } from './database.config.js';
import { databaseMigrations } from './migration-registry.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const applicationDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: databaseEntities,
  migrations: databaseMigrations,
  migrationsTableName: 'schema_migrations',
});
