import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeScheduleEntity, WorkScheduleEntity } from '../../database/entities/workforce.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkSchedulesController } from './work-schedules.controller.js';
import { WorkSchedulesService } from './work-schedules.service.js';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([WorkScheduleEntity, EmployeeScheduleEntity])], controllers: [WorkSchedulesController], providers: [WorkSchedulesService] })
export class WorkSchedulesModule {}
