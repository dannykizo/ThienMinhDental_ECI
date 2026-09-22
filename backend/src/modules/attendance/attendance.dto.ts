import { IsBoolean, IsDateString, IsDefined, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class RecordAttendanceEventDto {
  @IsIn(['CHECK_IN', 'CHECK_OUT']) eventType!: string;
  @IsIn(['OFFICE', 'BUSINESS_TRIP']) attendanceType!: string;
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
