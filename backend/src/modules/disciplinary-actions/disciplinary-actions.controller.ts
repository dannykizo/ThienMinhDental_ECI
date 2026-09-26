import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import {
  CreateDisciplinaryActionDto,
  RevokeDisciplinaryActionDto,
  UpdateDisciplinaryActionDto,
} from './disciplinary-actions.dto.js';
import { DisciplinaryActionsService } from './disciplinary-actions.service.js';

@Controller('disciplinary-actions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class DisciplinaryActionsController {
  constructor(private readonly service: DisciplinaryActionsService) {}

  @Get()
  list(): Promise<unknown> {
    return this.service.list();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUserView,
    @Body() input: CreateDisciplinaryActionDto,
  ): Promise<unknown> {
    return this.service.create(user, input);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUserView,
    @Param('id') id: string,
    @Body() input: UpdateDisciplinaryActionDto,
  ): Promise<unknown> {
    return this.service.update(user, id, input);
  }

  @Post(':id/issue')
  issue(
    @CurrentUser() user: AuthenticatedUserView,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.service.issue(user, id);
  }

  @Post(':id/revoke')
  revoke(
    @CurrentUser() user: AuthenticatedUserView,
    @Param('id') id: string,
    @Body() input: RevokeDisciplinaryActionDto,
  ): Promise<unknown> {
    return this.service.revoke(user, id, input);
  }

  @Get(':id/history')
  history(@Param('id') id: string): Promise<unknown> {
    return this.service.history(id);
  }
}
