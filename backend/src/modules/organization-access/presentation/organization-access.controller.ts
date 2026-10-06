import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { RoleCode } from '../../auth/domain/role-code.js';
import { CurrentUser } from '../../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { OrganizationAccessService } from '../application/organization-access.service.js';
import { AddTeamMemberDto, CreateManagementGrantDto, CreateTeamDto, ReasonDto, UpdateTeamDto } from './organization-access.dto.js';

@Controller('organization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationAccessController {
  constructor(private readonly service: OrganizationAccessService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.myAccess(user); }

  @Get('teams')
  teams(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.listTeams(user); }

  @Get('teams/:id/members')
  members(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> { return this.service.listMembers(user,id); }

  @Get('departments/:id/employees')
  employees(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> { return this.service.departmentEmployees(user,id); }

  @Post('teams') @Roles(RoleCode.Admin)
  createTeam(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateTeamDto): Promise<unknown> { return this.service.createTeam(user,input); }

  @Patch('teams/:id') @Roles(RoleCode.Admin)
  updateTeam(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateTeamDto): Promise<unknown> { return this.service.updateTeam(user,id,input); }

  @Post('teams/:id/members') @Roles(RoleCode.Admin)
  addMember(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: AddTeamMemberDto): Promise<unknown> { return this.service.addMember(user,id,input.employeeId); }

  @Post('teams/:id/members/:membershipId/end') @Roles(RoleCode.Admin)
  endMember(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Param('membershipId', ParseUUIDPipe) membershipId: string, @Body() input: ReasonDto): Promise<unknown> { return this.service.endMembership(user,id,membershipId,input.reason); }

  @Get('grants') @Roles(RoleCode.Admin)
  grants(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.listGrants(user); }

  @Post('grants') @Roles(RoleCode.Admin)
  grant(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateManagementGrantDto): Promise<unknown> { return this.service.createGrant(user,input); }

  @Post('grants/:id/revoke') @Roles(RoleCode.Admin)
  revoke(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: ReasonDto): Promise<unknown> { return this.service.revokeGrant(user,id,input.reason); }

  @Get('history') @Roles(RoleCode.Admin)
  history(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.history(user); }
}
