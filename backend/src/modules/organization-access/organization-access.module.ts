import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationAccessService } from './application/organization-access.service.js';
import { OrganizationAccessController } from './presentation/organization-access.controller.js';

@Module({ imports: [AuthModule], controllers: [OrganizationAccessController], providers: [OrganizationAccessService], exports: [OrganizationAccessService] })
export class OrganizationAccessModule {}
