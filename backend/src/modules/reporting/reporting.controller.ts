import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RoleCode } from '../auth/domain/role-code.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ReportingService } from './reporting.service.js';

@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.Manager)
export class ReportingController {
  constructor(private readonly service: ReportingService) {}
  @Get('dashboard') dashboard(): Promise<Record<string, number>> { return this.service.dashboard(); }
  @Get('monthly') monthly(@Query('month') month: string, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string): Promise<unknown> { return this.service.monthly(month, employeeId, departmentId); }
  @Get('monthly/export') async export(@Query('month') month: string, @Res() response: Response, @Query('employeeId') employeeId?: string, @Query('departmentId') departmentId?: string): Promise<void> {
    const buffer = await this.service.exportMonthly(month, employeeId, departmentId);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="bang-cong-${month}.xlsx"`);
    response.send(buffer);
  }
}
