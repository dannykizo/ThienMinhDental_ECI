import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { AssignDepartmentScheduleDto, AssignEmployeeScheduleDto, CreateWorkScheduleDto, UpdateWorkScheduleDto } from './work-schedules.dto.js';
import { WorkSchedulesService } from './work-schedules.service.js';

@Controller('work-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class WorkSchedulesController {
  constructor(private readonly service: WorkSchedulesService) {}
  @Get() list(): Promise<unknown> { return this.service.list(); }
  @Get('history') history(): Promise<unknown> { return this.service.history(); }
  @Post() create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateWorkScheduleDto): Promise<unknown> { return this.service.create(user, input); }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateWorkScheduleDto): Promise<unknown> { return this.service.update(user, id, input); }
  @Post(':id/employee-assignments') assignEmployee(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: AssignEmployeeScheduleDto): Promise<unknown> { return this.service.assignEmployee(user, id, input); }
  @Post(':id/department-assignments') assignDepartment(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: AssignDepartmentScheduleDto): Promise<unknown> { return this.service.assignDepartment(user, id, input); }
}
