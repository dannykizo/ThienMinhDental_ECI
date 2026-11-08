import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { OvertimeService } from './application/overtime.service.js';
import { ConfirmOvertimeDto, CreateOvertimeDto, ReviewOvertimeDto, SetOvertimeRouteDto } from './overtime.dto.js';

@Controller('overtime-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OvertimeController {
  constructor(private readonly service: OvertimeService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.list(user); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.list(user,true); }
  @Post('mine') create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateOvertimeDto): Promise<unknown> { return this.service.createMine(user,input); }
  @Get('routes') @Roles(RoleCode.Admin) routes(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.routes(user); }
  @Get('routing-options') @Roles(RoleCode.Admin) options(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.routingOptions(user); }
  @Put('routes/:employeeId') @Roles(RoleCode.Admin) route(@CurrentUser() user: AuthenticatedUserView, @Param('employeeId',ParseUUIDPipe) id: string, @Body() input: SetOvertimeRouteDto): Promise<unknown> { return this.service.setDefaultRoute(user,id,input); }
  @Patch(':id/reroute') @Roles(RoleCode.Admin) reroute(@CurrentUser() user: AuthenticatedUserView, @Param('id',ParseUUIDPipe) id: string, @Body() input: SetOvertimeRouteDto): Promise<unknown> { return this.service.reroute(user,id,input); }
  @Patch(':id/confirm') confirm(@CurrentUser() user: AuthenticatedUserView, @Param('id',ParseUUIDPipe) id: string, @Body() input: ConfirmOvertimeDto): Promise<unknown> { return this.service.process(user,id,input,true); }
  @Patch(':id/review') review(@CurrentUser() user: AuthenticatedUserView, @Param('id',ParseUUIDPipe) id: string, @Body() input: ReviewOvertimeDto): Promise<unknown> { return this.service.process(user,id,input,false); }
  @Get(':id/history') history(@CurrentUser() user: AuthenticatedUserView, @Param('id',ParseUUIDPipe) id: string): Promise<unknown> { return this.service.history(user,id); }
}
