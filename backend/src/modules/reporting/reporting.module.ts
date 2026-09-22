import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReportingController } from './reporting.controller.js';
import { ReportingService } from './reporting.service.js';

@Module({ imports: [AuthModule], controllers: [ReportingController], providers: [ReportingService], exports: [ReportingService] })
export class ReportingModule {}
