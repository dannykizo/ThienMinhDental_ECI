import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseEntities } from './database.config.js';
import { InitialFoundation1726358400000 } from './migrations/1726358400000-initial-foundation.js';
import { WebMvp1726444800000 } from './migrations/1726444800000-web-mvp.js';
import { CustomerOrganizationRbac1790035200000 } from './migrations/1790035200000-customer-organization-rbac.js';
import { AuthSessions1790121600000 } from './migrations/1790121600000-auth-sessions.js';
import { ScheduleLocationAlignment1790208000000 } from './migrations/1790208000000-schedule-location-alignment.js';
import { AttendanceReconciliation1790294400000 } from './migrations/1790294400000-attendance-reconciliation.js';
import { BusinessTripOperations1790380800000 } from './migrations/1790380800000-business-trip-operations.js';
import { LeaveOperations1790467200000 } from './migrations/1790467200000-leave-operations.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const applicationDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: databaseEntities,
  migrations: [
    InitialFoundation1726358400000,
    WebMvp1726444800000,
    CustomerOrganizationRbac1790035200000,
    AuthSessions1790121600000,
    ScheduleLocationAlignment1790208000000,
    AttendanceReconciliation1790294400000,
    BusinessTripOperations1790380800000,
    LeaveOperations1790467200000,
  ],
  migrationsTableName: 'schema_migrations',
});
