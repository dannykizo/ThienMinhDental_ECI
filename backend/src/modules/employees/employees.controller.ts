import { Body, Controller, Get, Patch, Post, Query, Param, UseGuards } from '@nestjs/common';
import { RoleCode } from '../auth/domain/role-code.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CreateEmployeeDto, CreateLookupDto, UpdateEmployeeDto } from './employees.dto.js';
import { EmployeesService } from './employees.service.js';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.Manager)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}
  @Get() list(@Query('search') search?: string): Promise<unknown> { return this.service.list(search); }
  @Post() create(@Body() input: CreateEmployeeDto): Promise<unknown> { return this.service.create(input); }
  @Patch(':id') update(@Param('id') id: string, @Body() input: UpdateEmployeeDto): Promise<unknown> { return this.service.update(id, input); }
  @Get('lookups/departments') departments(): Promise<unknown> { return this.service.listDepartments(); }
  @Post('lookups/departments') createDepartment(@Body() input: CreateLookupDto): Promise<unknown> { return this.service.createDepartment(input); }
  @Get('lookups/positions') positions(): Promise<unknown> { return this.service.listPositions(); }
  @Post('lookups/positions') createPosition(@Body() input: CreateLookupDto): Promise<unknown> { return this.service.createPosition(input); }
}
