import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReportingModule } from '../reporting/reporting.module.js';
import { KpiController } from './kpi.controller.js';

@Module({ imports: [AuthModule, ReportingModule], controllers: [KpiController] })
export class KpiModule {}
