import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessTripEntity, BusinessTripMemberEntity, CustomerEntity } from '../../database/entities/workforce.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessTripsController } from './business-trips.controller.js';
import { BusinessTripsService } from './business-trips.service.js';
import { BusinessTripEvidenceStorage } from './infrastructure/business-trip-evidence.storage.js';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([BusinessTripEntity, BusinessTripMemberEntity, CustomerEntity])], controllers: [BusinessTripsController], providers: [BusinessTripsService, BusinessTripEvidenceStorage] })
export class BusinessTripsModule {}
