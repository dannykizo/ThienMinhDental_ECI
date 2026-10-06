import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationAccessService } from './application/organization-access.service.js';
import { OrganizationAccessController } from './presentation/organization-access.controller.js';
import { ManagedModulesController } from './presentation/managed-modules.controller.js';
import { ManagedModulesService } from './application/managed-modules.service.js';
import { ReportingModule } from '../reporting/reporting.module.js';

@Module({ imports: [AuthModule, ReportingModule], controllers: [OrganizationAccessController,ManagedModulesController], providers: [OrganizationAccessService,ManagedModulesService], exports: [OrganizationAccessService] })
export class OrganizationAccessModule {}
