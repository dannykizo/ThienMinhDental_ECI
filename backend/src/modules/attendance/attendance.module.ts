import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceAdjustmentEntity, AttendanceEventEntity, AttendanceExplanationEntity, OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceEvidenceStorage } from './infrastructure/attendance-evidence.storage.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([AttendanceEventEntity, AttendanceAdjustmentEntity, AttendanceExplanationEntity, OfficeLocationEntity])],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceEvidenceStorage],
})
export class AttendanceModule {}
