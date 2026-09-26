import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { AdjustLeaveBalanceDto, CancelLeaveRequestDto, CreateLeavePolicyDto, CreateLeaveRequestDto, CreateOwnLeaveRequestDto, InitializeLeaveBalancesDto, ReviewLeaveRequestDto, UpdateLeavePolicyDto } from './leave.dto.js';
import { LeaveService } from './leave.service.js';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  constructor(private readonly service: LeaveService) {}
  @Get() @Roles(RoleCode.Admin, RoleCode.Manager) list(): Promise<unknown> { return this.service.list(); }
  @Get('policies') policies(): Promise<unknown> { return this.service.listPolicies(); }
  @Post('policies') @Roles(RoleCode.Admin) createPolicy(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateLeavePolicyDto): Promise<unknown> { return this.service.createPolicy(user, input); }
  @Patch('policies/:id') @Roles(RoleCode.Admin) updatePolicy(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: UpdateLeavePolicyDto): Promise<unknown> { return this.service.updatePolicy(user, id, input); }
  @Get('balances') @Roles(RoleCode.Admin) balances(@Query('year') year?: string): Promise<unknown> { return this.service.listBalances(this.service.parseYear(year)); }
  @Post('balances/initialize') @Roles(RoleCode.Admin) initializeBalances(@CurrentUser() user: AuthenticatedUserView, @Body() input: InitializeLeaveBalancesDto): Promise<unknown> { return this.service.initializeBalances(user, input); }
  @Post('balances/adjust') @Roles(RoleCode.Admin) adjustBalance(@CurrentUser() user: AuthenticatedUserView, @Body() input: AdjustLeaveBalanceDto): Promise<unknown> { return this.service.adjustBalance(user, input); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.listMine(user); }
  @Get('mine/balances') mineBalances(@CurrentUser() user: AuthenticatedUserView, @Query('year') year?: string): Promise<unknown> { return this.service.listMyBalances(user, this.service.parseYear(year)); }
  @Post() @Roles(RoleCode.Admin, RoleCode.Manager) create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateLeaveRequestDto): Promise<unknown> { return this.service.create(user, input.employeeId, input); }
  @Post('mine') createMine(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateOwnLeaveRequestDto): Promise<unknown> { return this.service.createMine(user, input); }
  @Get(':id/history') @Roles(RoleCode.Admin, RoleCode.Manager) history(@Param('id') id: string): Promise<unknown> { return this.service.history(id); }
  @Patch(':id/review') @Roles(RoleCode.Admin, RoleCode.Manager) review(@Param('id') id: string, @CurrentUser() user: AuthenticatedUserView, @Body() input: ReviewLeaveRequestDto): Promise<unknown> { return this.service.review(id, user, input); }
  @Post(':id/cancel') cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUserView, @Body() input: CancelLeaveRequestDto): Promise<unknown> { return this.service.cancel(id, user, input); }
}
