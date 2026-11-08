import { IsBase64, IsBoolean, IsDateString, IsDefined, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class RegisterAttendanceDeviceDto {
  @IsString() @IsBase64() @MaxLength(200) publicKey!: string;
}
export class DecideAttendanceDeviceDto {
  @IsIn(['APPROVE', 'REVOKE']) action!: 'APPROVE' | 'REVOKE';
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}

export class PrepareCheckInDto {
  @IsIn(['OFFICE', 'BUSINESS_TRIP']) attendanceType!: 'OFFICE' | 'BUSINESS_TRIP';
  @IsNumber() @IsLatitude() latitude!: number;
  @IsNumber() @IsLongitude() longitude!: number;
  @IsNumber() @Min(0) @Max(10000) accuracyMeters!: number;
  @IsBoolean() mockLocationSignal!: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(5) @MaxLength(2000) fieldWorkContent?: string;
}

export class RecordAttendanceEventDto {
  @IsIn(['CHECK_IN', 'CHECK_OUT']) eventType!: 'CHECK_IN' | 'CHECK_OUT';
  @IsIn(['OFFICE', 'BUSINESS_TRIP']) attendanceType!: 'OFFICE' | 'BUSINESS_TRIP';
  @IsOptional() @IsDateString() deviceTime?: string;
  @IsNumber() @IsLatitude() latitude!: number;
  @IsNumber() @IsLongitude() longitude!: number;
  @IsNumber() @Min(0) @Max(10000) accuracyMeters!: number;
  @IsBoolean() mockLocationSignal!: boolean;
  @IsOptional() @IsUUID() businessTripId?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() checkinCaptureId?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() challengeId?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @IsBase64() @MaxLength(200) signature?: string;
}

export class CreateAttendanceAdjustmentDto {
  @IsUUID() employeeId!: string;
  @IsDateString() workDate!: string;
  @IsIn(['CHECK_IN_TIME', 'CHECK_OUT_TIME', 'DAY_STATUS']) fieldName!: string;
  @IsDefined() newValue!: unknown;
  @IsString() @MinLength(5) reason!: string;
}

export class CreateAttendanceExplanationDto {
  @IsUUID() employeeId!: string;
  @IsDateString() workDate!: string;
  @IsOptional() @IsUUID() attendanceEventId?: string;
  @IsIn(['MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'DUPLICATE_ATTEMPT', 'WRONG_DATE_OR_DEVICE_TIME', 'GPS_RISK', 'OTHER']) issueType!: 'MISSING_CHECK_IN' | 'MISSING_CHECK_OUT' | 'DUPLICATE_ATTEMPT' | 'WRONG_DATE_OR_DEVICE_TIME' | 'GPS_RISK' | 'OTHER';
  @IsString() @MinLength(5) requestNote!: string;
  @IsDateString() dueAt!: string;
}

export class RespondAttendanceExplanationDto {
  @IsString() @MinLength(5) responseText!: string;
  @IsOptional() @IsString() @MaxLength(500) evidenceImageReference?: string;
  @IsOptional() @IsDateString() evidenceCapturedAt?: string;
  @IsOptional() @IsLatitude() evidenceLatitude?: number;
  @IsOptional() @IsLongitude() evidenceLongitude?: number;
}

export class UploadAttendanceEvidenceDto {
  @IsUUID() evidenceId!: string;
}

export class SubmitEmployeeExplanationDto extends RespondAttendanceExplanationDto {
  @MaxLength(2000) declare responseText: string;
  @IsUUID() submissionId!: string;
  @IsDateString() workDate!: string;
  @IsIn(['MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'DUPLICATE_ATTEMPT', 'WRONG_DATE_OR_DEVICE_TIME', 'GPS_RISK', 'OTHER']) issueType!: CreateAttendanceExplanationDto['issueType'];
}

export class ReviewAttendanceExplanationDto {
  @IsOptional() @IsString() @MinLength(5) @MaxLength(2000) adminOverrideReason?: string;
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) reviewNote?: string;
  @IsInt() @Min(0) expectedVersion!: number;
}

export class ConfirmAttendanceExplanationDto {
  @IsOptional() @IsString() @MaxLength(2000) confirmationNote?: string;
  @IsInt() @Min(0) expectedVersion!: number;
}

export class SetExplanationRouteDto {
  @IsUUID() teamId!: string;
  @IsUUID() leaderUserId!: string;
  @IsUUID() headUserId!: string;
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
  @IsInt() @Min(0) expectedVersion!: number;
}
