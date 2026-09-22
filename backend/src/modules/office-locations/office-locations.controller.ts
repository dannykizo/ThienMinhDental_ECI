import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '../auth/domain/role-code.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateOfficeLocationDto, UpdateOfficeLocationDto } from './office-locations.dto.js';
import { OfficeLocationsService } from './office-locations.service.js';

@Controller('office-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.Manager)
export class OfficeLocationsController {
  constructor(private readonly service: OfficeLocationsService) {}
  @Get() list(): Promise<unknown> { return this.service.list(); }
  @Post() create(@Body() input: CreateOfficeLocationDto): Promise<unknown> { return this.service.create(input); }
  @Patch(':id') update(@Param('id') id: string, @Body() input: UpdateOfficeLocationDto): Promise<unknown> { return this.service.update(id, input); }
}
