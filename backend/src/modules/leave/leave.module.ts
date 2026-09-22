import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequestEntity } from '../../database/entities/workforce.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([LeaveRequestEntity])], controllers: [LeaveController], providers: [LeaveService] })
export class LeaveModule {}
