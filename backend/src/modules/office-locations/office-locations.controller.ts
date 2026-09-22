import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateOfficeLocationDto, UpdateOfficeLocationDto } from './office-locations.dto.js';
import { OfficeLocationsService } from './office-locations.service.js';

@Controller('office-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class OfficeLocationsController {
  constructor(private readonly service: OfficeLocationsService) {}
  @Get() list(): Promise<unknown> { return this.service.list(); }
  @Get('history') history(): Promise<unknown> { return this.service.history(); }
  @Post() create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateOfficeLocationDto): Promise<unknown> { return this.service.create(user, input); }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateOfficeLocationDto): Promise<unknown> { return this.service.update(user, id, input); }
}
