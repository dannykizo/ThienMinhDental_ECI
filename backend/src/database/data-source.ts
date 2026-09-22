import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseEntities } from './database.config.js';
import { InitialFoundation1726358400000 } from './migrations/1726358400000-initial-foundation.js';
import { WebMvp1726444800000 } from './migrations/1726444800000-web-mvp.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const applicationDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: databaseEntities,
  migrations: [InitialFoundation1726358400000, WebMvp1726444800000],
  migrationsTableName: 'schema_migrations',
});
