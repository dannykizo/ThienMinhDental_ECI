import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RoleCode } from '../auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ReportingService } from './reporting.service.js';
import { LockAttendancePeriodDto, ReopenAttendancePeriodDto } from './reporting.dto.js';

@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(private readonly service: ReportingService) {}
  @Get('dashboard')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  dashboard(@CurrentUser() user: AuthenticatedUserView): Promise<Record<string, number>> { return this.service.dashboard(user); }
  @Get('monthly')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  monthly(@Query('month') month: string, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string): Promise<unknown> { return this.service.monthly(month, employeeId, departmentId); }
  @Get('monthly/export')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  async export(@Query('month') month: string, @Res() response: Response, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string): Promise<void> {
    const buffer = await this.service.exportMonthly(month, employeeId, departmentId);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="bang-cong-${month}.xlsx"`);
    response.send(buffer);
  }
  @Get('periods/:month')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  period(@Param('month') month: string): Promise<unknown> { return this.service.getPeriod(month); }
  @Post('periods/:month/lock')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  lockPeriod(@CurrentUser() user: AuthenticatedUserView, @Param('month') month: string, @Body() input: LockAttendancePeriodDto): Promise<unknown> { return this.service.lockPeriod(user, month, input.reason); }
  @Post('periods/:month/reopen')
  @Roles(RoleCode.ChiefAccountant)
  reopenPeriod(@CurrentUser() user: AuthenticatedUserView, @Param('month') month: string, @Body() input: ReopenAttendancePeriodDto): Promise<unknown> { return this.service.reopenPeriod(user, month, input.reason); }
}
