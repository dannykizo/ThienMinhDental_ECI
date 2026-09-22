import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '../auth/domain/role-code.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { AssignScheduleDto, CreateWorkScheduleDto, UpdateWorkScheduleDto } from './work-schedules.dto.js';
import { WorkSchedulesService } from './work-schedules.service.js';

@Controller('work-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.Manager)
export class WorkSchedulesController {
  constructor(private readonly service: WorkSchedulesService) {}
  @Get() list(): Promise<unknown> { return this.service.list(); }
  @Post() create(@Body() input: CreateWorkScheduleDto): Promise<unknown> { return this.service.create(input); }
  @Patch(':id') update(@Param('id') id: string, @Body() input: UpdateWorkScheduleDto): Promise<unknown> { return this.service.update(id, input); }
  @Post(':id/assignments') assign(@Param('id') id: string, @Body() input: AssignScheduleDto): Promise<unknown> { return this.service.assign(id, input); }
}
