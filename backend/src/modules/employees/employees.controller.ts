import { Body, Controller, Get, Patch, Post, Query, Param, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateEmployeeDto, CreateLookupDto, UpdateEmployeeDto } from './employees.dto.js';
import { EmployeesService } from './employees.service.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}
  @Get()
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  list(@CurrentUser() user: AuthenticatedUserView, @Query('search') search?: string): Promise<unknown> { return this.service.list(user, search); }
  @Post()
  @Roles(RoleCode.Admin)
  create(@Body() input: CreateEmployeeDto): Promise<unknown> { return this.service.create(input); }
  @Patch(':id')
  @Roles(RoleCode.Admin)
  update(@Param('id') id: string, @Body() input: UpdateEmployeeDto): Promise<unknown> { return this.service.update(id, input); }
  @Get('lookups/departments')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  departments(): Promise<unknown> { return this.service.listDepartments(); }
  @Post('lookups/departments')
  @Roles(RoleCode.Admin)
  createDepartment(@Body() input: CreateLookupDto): Promise<unknown> { return this.service.createDepartment(input); }
  @Get('lookups/positions')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  positions(): Promise<unknown> { return this.service.listPositions(); }
  @Post('lookups/positions')
  @Roles(RoleCode.Admin)
  createPosition(@Body() input: CreateLookupDto): Promise<unknown> { return this.service.createPosition(input); }
  @Get('lookups/branches')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  branches(): Promise<unknown> { return this.service.listBranches(); }
  @Post('lookups/branches')
  @Roles(RoleCode.Admin)
  createBranch(@Body() input: CreateLookupDto): Promise<unknown> { return this.service.createBranch(input); }
}
