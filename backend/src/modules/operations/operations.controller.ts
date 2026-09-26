import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '../auth/domain/role-code.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { OperationsAuditQueryDto } from './operations.dto.js';
import { OperationsService } from './operations.service.js';

@Controller('operations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get('overview') overview(): Promise<Record<string, unknown>> { return this.service.overview(); }
  @Get('audit') audit(@Query() query: OperationsAuditQueryDto): Promise<unknown[]> { return this.service.audit(query); }
}
