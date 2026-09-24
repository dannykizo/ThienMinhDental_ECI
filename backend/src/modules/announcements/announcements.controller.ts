import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import {
  CreateAnnouncementDto,
  RegisterPushDeviceDto,
  TransitionAnnouncementDto,
  UnregisterPushDeviceDto,
  UpdateAnnouncementDto,
} from './announcements.dto.js';
import { AnnouncementsService } from './announcements.service.js';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}
  @Get() @Roles(RoleCode.Admin) list(): Promise<unknown> { return this.service.list(); }
  @Get('managed') @Roles(RoleCode.Admin, RoleCode.AreaManager, RoleCode.Manager) managed(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.managed(user); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.mine(user); }
  @Post('push-devices') registerPushDevice(@CurrentUser() user: AuthenticatedUserView, @Body() input: RegisterPushDeviceDto): Promise<unknown> { return this.service.registerPushDevice(user, input); }
  @Post('push-devices/unregister') unregisterPushDevice(@CurrentUser() user: AuthenticatedUserView, @Body() input: UnregisterPushDeviceDto): Promise<unknown> { return this.service.unregisterPushDevice(user, input); }
  @Post() @Roles(RoleCode.Admin) create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateAnnouncementDto): Promise<unknown> { return this.service.create(user, input); }
  @Post(':id/read') markRead(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string): Promise<unknown> { return this.service.markRead(user, id); }
  @Post(':id/acknowledge') acknowledge(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string): Promise<unknown> { return this.service.acknowledge(user, id); }
  @Get(':id/recipients') @Roles(RoleCode.Admin, RoleCode.AreaManager, RoleCode.Manager) recipients(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string): Promise<unknown> { return this.service.recipients(user, id); }
  @Get(':id/history') @Roles(RoleCode.Admin) history(@Param('id') id: string): Promise<unknown> { return this.service.history(id); }
  @Patch(':id') @Roles(RoleCode.Admin) update(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: UpdateAnnouncementDto): Promise<unknown> { return this.service.update(user, id, input); }
  @Patch(':id/status') @Roles(RoleCode.Admin) transition(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: TransitionAnnouncementDto): Promise<unknown> { return this.service.transition(user, id, input); }
}
