import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AnnouncementsModule } from './modules/announcements/announcements.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BusinessTripsModule } from './modules/business-trips/business-trips.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { KpiModule } from './modules/kpi/kpi.module.js';
import { LeaveModule } from './modules/leave/leave.module.js';
import { OfficeLocationsModule } from './modules/office-locations/office-locations.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { WorkSchedulesModule } from './modules/work-schedules/work-schedules.module.js';
import { validateEnvironment } from './config/validate-environment.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    EmployeesModule,
    WorkSchedulesModule,
    OfficeLocationsModule,
    AttendanceModule,
    BusinessTripsModule,
    LeaveModule,
    AnnouncementsModule,
    ReportingModule,
    KpiModule,
  ],
})
export class AppModule {}
