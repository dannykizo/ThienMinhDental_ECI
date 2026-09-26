import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisciplinaryActionEntity } from '../../database/entities/disciplinary-action.entity.js';
import { AnnouncementsModule } from '../announcements/announcements.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DisciplinaryActionsController } from './disciplinary-actions.controller.js';
import { DisciplinaryActionsService } from './disciplinary-actions.service.js';

@Module({
  imports: [
    AuthModule,
    AnnouncementsModule,
    TypeOrmModule.forFeature([DisciplinaryActionEntity]),
  ],
  controllers: [DisciplinaryActionsController],
  providers: [DisciplinaryActionsService],
})
export class DisciplinaryActionsModule {}
