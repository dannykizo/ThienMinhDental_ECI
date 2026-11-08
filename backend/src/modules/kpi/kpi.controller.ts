import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '../auth/domain/role-code.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ReportingService } from '../reporting/reporting.service.js';

@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.ChiefAccountant)
export class KpiController {
  constructor(private readonly reporting: ReportingService) {}
  @Get('monthly') monthly(@Query('month') month: string): Promise<unknown> { return this.reporting.kpi(month); }
  @Get('monthly/document') document(@Query('month') month: string, @Query('revision') revision?: string): Promise<unknown> { return this.reporting.kpiDocument(month, revision); }
}
