import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateAnnouncementDto, TransitionAnnouncementDto } from './announcements.dto.js';
import { AnnouncementsService } from './announcements.service.js';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}
  @Get() @Roles(RoleCode.Admin, RoleCode.Manager) list(): Promise<unknown> { return this.service.list(); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.mine(user); }
  @Post() @Roles(RoleCode.Admin, RoleCode.Manager) create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateAnnouncementDto): Promise<unknown> { return this.service.create(user, input); }
  @Post(':id/read') markRead(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string): Promise<unknown> { return this.service.markRead(user, id); }
  @Patch(':id/status') @Roles(RoleCode.Admin, RoleCode.Manager) transition(@Param('id') id: string, @Body() input: TransitionAnnouncementDto): Promise<unknown> { return this.service.transition(id, input); }
}
