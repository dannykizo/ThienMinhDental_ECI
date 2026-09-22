import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateBusinessTripDto, CreateCustomerDto, TransitionBusinessTripDto } from './business-trips.dto.js';
import { BusinessTripsService } from './business-trips.service.js';

@Controller('business-trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.Manager)
export class BusinessTripsController {
  constructor(private readonly service: BusinessTripsService) {}
  @Get() list(): Promise<unknown> { return this.service.list(); }
  @Post() create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateBusinessTripDto): Promise<unknown> { return this.service.create(user, input); }
  @Patch(':id/status') transition(@Param('id') id: string, @Body() input: TransitionBusinessTripDto): Promise<unknown> { return this.service.transition(id, input); }
  @Get('lookups/customers') customers(): Promise<unknown> { return this.service.listCustomers(); }
  @Post('lookups/customers') createCustomer(@Body() input: CreateCustomerDto): Promise<unknown> { return this.service.createCustomer(input); }
}
