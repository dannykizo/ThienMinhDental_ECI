import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OvertimeRequestEntity } from '../../database/entities/overtime.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { AnnouncementsModule } from '../announcements/announcements.module.js';
import { OvertimeController } from './overtime.controller.js';
import { OvertimeService } from './application/overtime.service.js';

@Module({ imports:[AuthModule,AnnouncementsModule,TypeOrmModule.forFeature([OvertimeRequestEntity])], controllers:[OvertimeController], providers:[OvertimeService] })
export class OvertimeModule {}
