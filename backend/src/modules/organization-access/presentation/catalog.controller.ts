import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { CurrentUser } from '../../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { CatalogService } from '../application/catalog.service.js';
import { CatalogDecisionDto, CreateCatalogDto, UpdateCatalogDto } from './catalog.dto.js';

@Controller('organization/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
  @Get(':kind') list(@CurrentUser() user: AuthenticatedUserView, @Param('kind') kind: string): Promise<unknown> { return this.service.list(user,kind); }
  @Post(':kind') create(@CurrentUser() user: AuthenticatedUserView, @Param('kind') kind: string, @Body() input: CreateCatalogDto): Promise<unknown> { return this.service.create(user,kind,input); }
  @Get(':kind/:id/impact') impact(@CurrentUser() user: AuthenticatedUserView, @Param('kind') kind: string, @Param('id',ParseUUIDPipe) id: string): Promise<unknown> { return this.service.impact(user,kind,id); }
  @Patch(':kind/:id') update(@CurrentUser() user: AuthenticatedUserView, @Param('kind') kind: string, @Param('id',ParseUUIDPipe) id: string, @Body() input: UpdateCatalogDto): Promise<unknown> { return this.service.update(user,kind,id,input); }
  @Delete(':kind/:id') remove(@CurrentUser() user: AuthenticatedUserView, @Param('kind') kind: string, @Param('id',ParseUUIDPipe) id: string, @Body() input: CatalogDecisionDto): Promise<unknown> { return this.service.remove(user,kind,id,input); }
}
