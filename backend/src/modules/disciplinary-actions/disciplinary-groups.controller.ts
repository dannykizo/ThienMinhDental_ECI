import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { DisciplinaryGroupTargetDto, IssueDisciplinaryGroupDto, RevokeDisciplinaryActionDto } from './disciplinary-actions.dto.js';
import { DisciplinaryGroupsService } from './disciplinary-groups.service.js';

@Controller('disciplinary-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class DisciplinaryGroupsController {
  constructor(private readonly service: DisciplinaryGroupsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.list(user); }
  @Get('targets') targets(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.targets(user); }
  @Post('preview') preview(@CurrentUser() user: AuthenticatedUserView, @Body() input: DisciplinaryGroupTargetDto): Promise<unknown> { return this.service.preview(user, input); }
  @Post() issue(@CurrentUser() user: AuthenticatedUserView, @Body() input: IssueDisciplinaryGroupDto): Promise<unknown> { return this.service.issue(user, input); }
  @Post(':id/revoke') revoke(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: RevokeDisciplinaryActionDto): Promise<unknown> { return this.service.revoke(user, id, input); }
  @Get(':id/history') history(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> { return this.service.history(user, id); }
}
