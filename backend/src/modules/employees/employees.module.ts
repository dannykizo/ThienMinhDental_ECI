import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentEntity } from '../../database/entities/department.entity.js';
import { EmployeeEntity } from '../../database/entities/employee.entity.js';
import { PositionEntity } from '../../database/entities/position.entity.js';
import { BranchEntity, EmployeeOrganizationAssignmentEntity, UserBranchScopeEntity } from '../../database/entities/organization.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({ imports: [AuthModule, TypeOrmModule.forFeature([EmployeeEntity, DepartmentEntity, PositionEntity, BranchEntity, EmployeeOrganizationAssignmentEntity, UserBranchScopeEntity])], controllers: [EmployeesController], providers: [EmployeesService] })
export class EmployeesModule {}
