import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementEntity, AnnouncementRecipientEntity } from '../../database/entities/workforce.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { ANNOUNCEMENT_PUSH_SENDER } from './application/announcement-push.sender.js';
import { FirebaseAnnouncementPushSender } from './infrastructure/firebase-announcement-push.sender.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      AnnouncementEntity,
      AnnouncementRecipientEntity,
    ]),
  ],
  controllers: [AnnouncementsController],
  providers: [
    AnnouncementsService,
    FirebaseAnnouncementPushSender,
    {
      provide: ANNOUNCEMENT_PUSH_SENDER,
      useExisting: FirebaseAnnouncementPushSender,
    },
  ],
})
export class AnnouncementsModule {}
