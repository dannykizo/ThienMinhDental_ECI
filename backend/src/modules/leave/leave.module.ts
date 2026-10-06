import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequestEntity } from '../../database/entities/workforce.entity.js';
import { EmployeeLeaveBalanceEntity, LeaveBalanceAdjustmentEntity, LeavePolicyEntity } from '../../database/entities/leave-policy.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';
import { LeaveWorkflowService } from './application/leave-workflow.service.js';
import { AnnouncementsModule } from '../announcements/announcements.module.js';

@Module({ imports: [AuthModule, AnnouncementsModule, TypeOrmModule.forFeature([LeaveRequestEntity, LeavePolicyEntity, EmployeeLeaveBalanceEntity, LeaveBalanceAdjustmentEntity])], controllers: [LeaveController], providers: [LeaveService, LeaveWorkflowService] })
export class LeaveModule {}
