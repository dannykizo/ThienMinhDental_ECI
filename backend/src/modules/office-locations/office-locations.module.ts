import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeLocationEntity } from '../../database/entities/workforce.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { OfficeLocationsController } from './office-locations.controller.js';
import { OfficeLocationsService } from './office-locations.service.js';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([OfficeLocationEntity])], controllers: [OfficeLocationsController], providers: [OfficeLocationsService] })
export class OfficeLocationsModule {}
