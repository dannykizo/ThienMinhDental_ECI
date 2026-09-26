import { Body, Controller, Get, Patch, Post, Query, Param, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ChangeEmployeeStatusDto, CreateEmployeeDto, CreateLookupDto, EmployeeListQueryDto, UpdateEmployeeDto } from './employees.dto.js';
import { EmployeesService } from './employees.service.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}
  @Get()
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  list(@CurrentUser() user: AuthenticatedUserView, @Query() query: EmployeeListQueryDto): Promise<unknown> { return this.service.list(user, query.search, query.page, query.pageSize); }
  @Post()
  @Roles(RoleCode.Admin)
  create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateEmployeeDto): Promise<unknown> { return this.service.create(user, input); }
  @Get(':id/history')
  @Roles(RoleCode.Admin)
  history(@Param('id') id: string): Promise<unknown> { return this.service.history(id); }
  @Patch(':id/status')
  @Roles(RoleCode.Admin)
  changeStatus(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: ChangeEmployeeStatusDto): Promise<unknown> { return this.service.changeStatus(user, id, input); }
  @Patch(':id')
  @Roles(RoleCode.Admin)
  update(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: UpdateEmployeeDto): Promise<unknown> { return this.service.update(user, id, input); }
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
