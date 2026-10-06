import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUserView } from '../../auth/application/auth.service.js';
import { CurrentUser } from '../../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/presentation/jwt-auth.guard.js';
import { ManagedModulesService } from '../application/managed-modules.service.js';

@Controller('organization/managed')
@UseGuards(JwtAuthGuard)
export class ManagedModulesController {
  constructor(private readonly service: ManagedModulesService) {}
  @Get('attendance') attendance(@CurrentUser() user:AuthenticatedUserView,@Query('month') month?:string):Promise<unknown> { return this.service.attendance(user,month); }
  @Get('reports') reports(@CurrentUser() user:AuthenticatedUserView,@Query('month') month?:string):Promise<unknown> { return this.service.reports(user,month); }
  @Get('business-trips') trips(@CurrentUser() user:AuthenticatedUserView):Promise<unknown> { return this.service.trips(user); }
  @Get('announcements') announcements(@CurrentUser() user:AuthenticatedUserView):Promise<unknown> { return this.service.announcements(user); }
}
