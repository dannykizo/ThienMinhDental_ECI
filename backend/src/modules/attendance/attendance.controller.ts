import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUserView } from '../auth/application/auth.service.js';
import { RoleCode } from '../auth/domain/role-code.js';
import { CurrentUser } from '../auth/presentation/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/presentation/jwt-auth.guard.js';
import { Roles } from '../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../auth/presentation/roles.guard.js';
import { ConfirmAttendanceExplanationDto, SetExplanationRouteDto, CreateAttendanceAdjustmentDto, CreateAttendanceExplanationDto, RecordAttendanceEventDto, RespondAttendanceExplanationDto, ReviewAttendanceExplanationDto, SubmitEmployeeExplanationDto, UploadAttendanceEvidenceDto } from './attendance.dto.js';
import { ExplanationWorkflowService } from './application/explanation-workflow.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceEvidenceStorage, type AttendanceEvidenceUpload } from './infrastructure/attendance-evidence.storage.js';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly evidenceStorage: AttendanceEvidenceStorage,
    private readonly workflow: ExplanationWorkflowService,
  ) {}
  @Post('events') record(@CurrentUser() user: AuthenticatedUserView, @Body() input: RecordAttendanceEventDto): Promise<unknown> { return this.service.record(user, input); }
  @Get('me/today') today(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.getToday(user); }
  @Get('daily') @Roles(RoleCode.Admin, RoleCode.ChiefAccountant, RoleCode.Manager) daily(@Query('date') date?: string): Promise<unknown> { return this.service.list(date); }
  @Post('adjustments') @Roles(RoleCode.Admin) adjust(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateAttendanceAdjustmentDto): Promise<unknown> { return this.service.createAdjustment(user, input); }
  @Get('adjustments') @Roles(RoleCode.Admin) adjustments(): Promise<unknown> { return this.service.listAdjustments(); }
  @Get('explanations/mine') explanationsMine(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.service.listMyExplanations(user); }
  @Post('explanations/mine') submitExplanation(@CurrentUser() user: AuthenticatedUserView, @Body() input: SubmitEmployeeExplanationDto): Promise<unknown> { return this.service.submitEmployeeExplanation(user, input); }
  @Post('evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  uploadEvidence(
    @CurrentUser() user: AuthenticatedUserView,
    @Body() input: UploadAttendanceEvidenceDto,
    @UploadedFile() file?: AttendanceEvidenceUpload,
  ): Promise<{ reference: string }> {
    return this.evidenceStorage.store(user, input.evidenceId, file);
  }
  @Get('evidence/:filename')
  async evidence(@CurrentUser() user: AuthenticatedUserView, @Param('filename') filename: string): Promise<StreamableFile> {
    const file = await this.evidenceStorage.read(filename, user);
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: 'inline' });
  }
  @Patch('explanations/:id/respond') respondToExplanation(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: RespondAttendanceExplanationDto): Promise<unknown> { return this.service.respondToExplanation(user, id, input); }
  @Get('explanations') explanations(@CurrentUser() user: AuthenticatedUserView, @Query('date') date?: string): Promise<unknown> { return this.workflow.list(user, date); }
  @Get('explanations/routes') @Roles(RoleCode.Admin) routes(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.workflow.routes(user); }
  @Get('explanations/routing-options') @Roles(RoleCode.Admin) routingOptions(@CurrentUser() user: AuthenticatedUserView): Promise<unknown> { return this.workflow.routingOptions(user); }
  @Put('explanations/routes/:employeeId') @Roles(RoleCode.Admin) setRoute(@CurrentUser() user: AuthenticatedUserView, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() input: SetExplanationRouteDto): Promise<unknown> { return this.workflow.setDefaultRoute(user, employeeId, input); }
  @Patch('explanations/:id/reroute') @Roles(RoleCode.Admin) reroute(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: SetExplanationRouteDto): Promise<unknown> { return this.workflow.reroute(user, id, input); }
  @Get('explanations/:id/history') history(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> { return this.workflow.history(user, id); }
  @Patch('explanations/:id/confirm') confirm(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: ConfirmAttendanceExplanationDto): Promise<unknown> { return this.workflow.process(user, id, input, true); }
  @Post('explanations') @Roles(RoleCode.Admin) requestExplanation(@CurrentUser() user: AuthenticatedUserView, @Body() input: CreateAttendanceExplanationDto): Promise<unknown> { return this.service.createExplanation(user, input); }
  @Patch('explanations/:id/review') reviewExplanation(@CurrentUser() user: AuthenticatedUserView, @Param('id', ParseUUIDPipe) id: string, @Body() input: ReviewAttendanceExplanationDto): Promise<unknown> { return this.workflow.process(user, id, input, false); }
}
