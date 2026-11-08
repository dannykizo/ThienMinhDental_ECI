import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentEntity } from '../../database/entities/department.entity.js';
import { EmployeeEntity } from '../../database/entities/employee.entity.js';
import { PositionEntity } from '../../database/entities/position.entity.js';
import { BranchEntity, EmployeeOrganizationAssignmentEntity, UserBranchScopeEntity } from '../../database/entities/organization.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { CatalogService } from '../organization-access/application/catalog.service.js';
import { EmployeeAdminService } from './employee-admin.service.js';
import { EmployeeFileCleanup } from './infrastructure/employee-file-cleanup.js';
import { EmployeePortraitsController, EmployeeOwnPortraitController } from './employee-portraits.controller.js';
import { EmployeePortraitsService } from './employee-portraits.service.js';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([EmployeeEntity, DepartmentEntity, PositionEntity, BranchEntity, EmployeeOrganizationAssignmentEntity, UserBranchScopeEntity])], controllers: [EmployeePortraitsController, EmployeeOwnPortraitController, EmployeesController], providers: [EmployeesService,CatalogService,EmployeeAdminService,EmployeeFileCleanup,EmployeePortraitsService] })
export class EmployeesModule {}
