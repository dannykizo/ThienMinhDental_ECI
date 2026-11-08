import { Body, Controller, Delete, Get, Patch, Post, Query, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ChangeEmployeeStatusDto, CreateEmployeeDto, CreateLookupDto, DeleteEmployeeDto, EmployeeListQueryDto, ResetEmployeePasswordDto, UpdateEmployeeDto } from './employees.dto.js';
import { EmployeesService } from './employees.service.js';
import { EmployeeAdminService } from './employee-admin.service.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService, private readonly adminService: EmployeeAdminService) {}
  @Get(':id/account') @Roles(RoleCode.Admin)
  account(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> { return this.adminService.account(user,id); }
  @Post(':id/account/reset-password') @Roles(RoleCode.Admin)
  resetPassword(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: ResetEmployeePasswordDto): Promise<unknown> { return this.adminService.resetPassword(user,id,input); }
  @Get(':id/deletion-impact') @Roles(RoleCode.Admin)
  deletionImpact(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> { return this.adminService.deletionImpact(user,id); }
  @Delete(':id') @Roles(RoleCode.Admin)
  delete(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: DeleteEmployeeDto): Promise<unknown> { return this.adminService.delete(user,id,input); }
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
  createDepartment(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateLookupDto): Promise<unknown> { return this.service.createDepartment(user,input); }
  @Get('lookups/positions')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  positions(): Promise<unknown> { return this.service.listPositions(); }
  @Post('lookups/positions')
  @Roles(RoleCode.Admin)
  createPosition(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateLookupDto): Promise<unknown> { return this.service.createPosition(user,input); }
  @Get('lookups/branches')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  branches(): Promise<unknown> { return this.service.listBranches(); }
  @Post('lookups/branches')
  @Roles(RoleCode.Admin)
  createBranch(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateLookupDto): Promise<unknown> { return this.service.createBranch(user,input); }
  @Get(':id') @Roles(RoleCode.Admin)
  detail(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string): Promise<unknown> { return this.service.detail(user, id); }
}
