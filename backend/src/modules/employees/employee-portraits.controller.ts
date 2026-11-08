import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { IsString, Matches } from 'class-validator';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { EmployeePortraitsService, type PortraitUpload } from './employee-portraits.service.js';

export class PortraitVersionDto {
  @IsString() @Matches(/^(none|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i) expectedVersion!: string;
}
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin)
export class EmployeePortraitsController {
  constructor(private readonly service: EmployeePortraitsService) {}
  @Get('portraits') list(@CurrentUser() actor: AuthenticatedUserView): Promise<unknown> { return this.service.list(actor); }
  @Get(':id/portrait')
  async read(@CurrentUser() actor: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Query('size') size?: string): Promise<StreamableFile> {
    return new StreamableFile(await this.service.read(actor, id, size === 'thumbnail'), { type: 'image/jpeg', disposition: 'inline' });
  }
  @Post(':id/portrait')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'portrait', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }], { limits: { fileSize: 768 * 1024, files: 2, fields: 1, parts: 3, fieldSize: 100 } }))
  save(@CurrentUser() actor: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: PortraitVersionDto, @UploadedFiles() files: { portrait?: PortraitUpload[]; thumbnail?: PortraitUpload[] } = {}): Promise<unknown> {
    return this.service.save(actor, id, input.expectedVersion, files);
  }
  @Delete(':id/portrait') remove(@CurrentUser() actor: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: PortraitVersionDto): Promise<void> { return this.service.remove(actor, id, input.expectedVersion); }
}

// Self-service never accepts an employee ID from the client. No directory access.
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class EmployeeOwnPortraitController {
  constructor(private readonly service: EmployeePortraitsService) {}
  @Get('portrait/info') mine(@CurrentUser() actor: AuthenticatedUserView): Promise<unknown> { return this.service.mine(actor); }
  @Get('portrait')
  async read(@CurrentUser() actor: AuthenticatedUserView, @Query('size') size?: string): Promise<StreamableFile> {
    return new StreamableFile(await this.service.readMine(actor, size === 'thumbnail'), { type: 'image/jpeg', disposition: 'inline' });
  }
  @Post('portrait')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'portrait', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }], { limits: { fileSize: 768 * 1024, files: 2, fields: 1, parts: 3, fieldSize: 100 } }))
  save(@CurrentUser() actor: AuthenticatedUserView, @Body() input: PortraitVersionDto, @UploadedFiles() files: { portrait?: PortraitUpload[]; thumbnail?: PortraitUpload[] } = {}): Promise<unknown> {
    return this.service.saveMine(actor, input.expectedVersion, files);
  }
}
