import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateAttendanceAdjustmentDto, RecordAttendanceEventDto } from './attendance.dto.js';
import { AttendanceService } from './attendance.service.js';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}
  @Post('events') record(@CurrentUser() user: AuthenticatedUserView, @Body() input: RecordAttendanceEventDto): Promise<unknown> { return this.service.record(user, input); }
  @Get('me/today') today(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.getToday(user); }
  @Get('daily') @Roles(RoleCode.Admin, RoleCode.Manager) daily(@Query('date') date?: string): Promise<unknown> { return this.service.list(date); }
  @Post('adjustments') @Roles(RoleCode.Admin) adjust(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateAttendanceAdjustmentDto): Promise<unknown> { return this.service.createAdjustment(user, input); }
  @Get('adjustments') @Roles(RoleCode.Admin, RoleCode.Manager) adjustments(): Promise<unknown> { return this.service.listAdjustments(); }
}
