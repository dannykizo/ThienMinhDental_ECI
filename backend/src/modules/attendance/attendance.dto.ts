import { IsBoolean, IsDateString, IsDefined, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RecordAttendanceEventDto {
  @IsIn(['CHECK_IN', 'CHECK_OUT']) eventType!: 'CHECK_IN' | 'CHECK_OUT';
  @IsIn(['OFFICE', 'BUSINESS_TRIP']) attendanceType!: 'OFFICE' | 'BUSINESS_TRIP';
  @IsOptional() @IsDateString() deviceTime?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) accuracyMeters?: number;
  @IsOptional() @IsBoolean() mockLocationSignal?: boolean;
  @IsOptional() @IsUUID() businessTripId?: string;
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

export class ReviewAttendanceExplanationDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MinLength(5) reviewNote?: string;
}
