import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateLeaveRequestDto, ReviewLeaveRequestDto } from './leave.dto.js';
import { LeaveService } from './leave.service.js';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.Manager)
export class LeaveController {
  constructor(private readonly service: LeaveService) {}
  @Get() list(): Promise<unknown> { return this.service.list(); }
  @Post() create(@Body() input: CreateLeaveRequestDto): Promise<unknown> { return this.service.create(input); }
  @Patch(':id/review') review(@Param('id') id: string, @CurrentUser() user: AuthenticatedUserView, @Body() input: ReviewLeaveRequestDto): Promise<unknown> { return this.service.review(id, user, input); }
}
