import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateLeaveRequestDto, CreateOwnLeaveRequestDto, ReviewLeaveRequestDto } from './leave.dto.js';
import { LeaveService } from './leave.service.js';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  constructor(private readonly service: LeaveService) {}
  @Get() @Roles(RoleCode.Admin, RoleCode.Manager) list(): Promise<unknown> { return this.service.list(); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.listMine(user); }
  @Post() @Roles(RoleCode.Admin, RoleCode.Manager) create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateLeaveRequestDto): Promise<unknown> { return this.service.create(user, input.employeeId, input); }
  @Post('mine') createMine(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateOwnLeaveRequestDto): Promise<unknown> { return this.service.createMine(user, input); }
  @Get(':id/history') @Roles(RoleCode.Admin, RoleCode.Manager) history(@Param('id') id: string): Promise<unknown> { return this.service.history(id); }
  @Patch(':id/review') @Roles(RoleCode.Admin, RoleCode.Manager) review(@Param('id') id: string, @CurrentUser() user: AuthenticatedUserView, @Body() input: ReviewLeaveRequestDto): Promise<unknown> { return this.service.review(id, user, input); }
}
