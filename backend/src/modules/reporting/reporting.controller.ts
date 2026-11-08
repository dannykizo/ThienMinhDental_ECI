import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RoleCode } from '../auth/domain/role-code.js';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ReportingService, type DashboardSummary } from './reporting.service.js';
import { LockAttendancePeriodDto, ReopenAttendancePeriodDto } from './reporting.dto.js';

@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(private readonly service: ReportingService) {}
  @Get('dashboard')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.AreaManager, RoleCode.Manager)
  dashboard(@CurrentUser() user: AuthenticatedUserView): Promise<DashboardSummary> { return this.service.dashboard(user); }
  @Get('monthly')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  monthly(@Query('month') month: string, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string): Promise<unknown> { return this.service.monthly(month, employeeId, departmentId); }
  @Get('monthly/summary')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  monthlySummary(@Query('month') month: string, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string): Promise<unknown> { return this.service.monthlySummary(month, employeeId, departmentId); }
  @Get('monthly/document')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  document(@Query('month') month: string, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string, @Query('revision') revision?: string): Promise<unknown> { return this.service.document(month, employeeId, departmentId, revision); }
  @Get('monthly/export')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  async export(@Query('month') month: string, @Res() response: Response, @CurrentUser() user: AuthenticatedUserView, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string, @Query('revision') revision?: string): Promise<void> {
    const buffer = await this.service.exportMonthly(month, employeeId, departmentId, revision, user.displayName || user.email);
    this.sendWorkbook(response, buffer, `bang-cong-${month}.xlsx`);
  }
  @Get('periods/:month')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  period(@Param('month') month: string): Promise<unknown> { return this.service.getPeriod(month); }
  @Get('leave/export')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  async exportLeave(@Query('month') month: string, @Res() response: Response, @CurrentUser() user: AuthenticatedUserView, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string, @Query('revision') revision?: string): Promise<void> {
    this.sendWorkbook(response, await this.service.exportSupporting('leave', month, employeeId, departmentId, revision, user.displayName || user.email), `nghi-phep-so-du-${month}.xlsx`);
  }
  @Get('overtime/export')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  async exportOvertime(@Query('month') month: string, @Res() response: Response, @CurrentUser() user: AuthenticatedUserView, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string, @Query('revision') revision?: string): Promise<void> {
    this.sendWorkbook(response, await this.service.exportSupporting('overtime', month, employeeId, departmentId, revision, user.displayName || user.email), `ot-${month}.xlsx`);
  }
  @Get('explanations/export')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  async exportExplanations(@Query('month') month: string, @Res() response: Response, @CurrentUser() user: AuthenticatedUserView, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string, @Query('revision') revision?: string): Promise<void> {
    this.sendWorkbook(response, await this.service.exportSupporting('explanations', month, employeeId, departmentId, revision, user.displayName || user.email), `giai-trinh-dieu-chinh-${month}.xlsx`);
  }
  private sendWorkbook(response: Response, buffer: Buffer, filename: string): void {
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }
  @Post('periods/:month/lock')
  @Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
  lockPeriod(@CurrentUser() user: AuthenticatedUserView, @Param('month') month: string, @Body() input: LockAttendancePeriodDto): Promise<unknown> { return this.service.lockPeriod(user, month, input.reason); }
  @Post('periods/:month/reopen')
  @Roles(RoleCode.ChiefAccountant)
  reopenPeriod(@CurrentUser() user: AuthenticatedUserView, @Param('month') month: string, @Body() input: ReopenAttendancePeriodDto): Promise<unknown> { return this.service.reopenPeriod(user, month, input.reason); }
}
