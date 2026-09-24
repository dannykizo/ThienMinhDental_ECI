import { Body, Controller, Get, Param, Patch, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { CompleteBusinessTripDto, CreateBusinessTripDto, CreateCustomerDto, StartBusinessTripDto, TransitionBusinessTripDto, UpdateBusinessTripDto, UploadBusinessTripEvidenceDto } from './business-trips.dto.js';
import { BusinessTripsService } from './business-trips.service.js';
import { BusinessTripEvidenceStorage, type BusinessTripEvidenceUpload } from './infrastructure/business-trip-evidence.storage.js';

@Controller('business-trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessTripsController {
  constructor(
    private readonly service: BusinessTripsService,
    private readonly evidenceStorage: BusinessTripEvidenceStorage,
  ) {}
  @Get() @Roles(RoleCode.Admin) list(): Promise<unknown> { return this.service.list(); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.listMine(user); }
  @Get('lookups/customers') @Roles(RoleCode.Admin) customers(): Promise<unknown> { return this.service.listCustomers(); }
  @Post('evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  uploadEvidence(
    @CurrentUser() user: AuthenticatedUserView,
    @Body() input: UploadBusinessTripEvidenceDto,
    @UploadedFile() file?: BusinessTripEvidenceUpload,
  ): Promise<{ reference: string }> {
    return this.evidenceStorage.store(user, input.evidenceId, file);
  }
  @Get('evidence/:filename')
  async evidence(@Param('filename') filename: string): Promise<StreamableFile> {
    const file = await this.evidenceStorage.read(filename);
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: 'inline' });
  }
  @Post('lookups/customers') @Roles(RoleCode.Admin) createCustomer(@Body() input: CreateCustomerDto): Promise<unknown> { return this.service.createCustomer(input); }
  @Post() @Roles(RoleCode.Admin) create(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateBusinessTripDto): Promise<unknown> { return this.service.create(user, input); }
  @Patch(':id') @Roles(RoleCode.Admin) update(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: UpdateBusinessTripDto): Promise<unknown> { return this.service.update(user, id, input); }
  @Patch(':id/status') @Roles(RoleCode.Admin) transition(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: TransitionBusinessTripDto): Promise<unknown> { return this.service.transition(user, id, input); }
  @Get(':id/history') @Roles(RoleCode.Admin) history(@Param('id') id: string): Promise<unknown> { return this.service.history(id); }
  @Post(':id/start') start(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: StartBusinessTripDto): Promise<unknown> { return this.service.start(user, id, input); }
  @Post(':id/complete') complete(@CurrentUser() user: AuthenticatedUserView, @Param('id') id: string, @Body() input: CompleteBusinessTripDto): Promise<unknown> { return this.service.complete(user, id, input); }
}
