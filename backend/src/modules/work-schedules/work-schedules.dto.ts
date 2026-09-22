import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateWorkScheduleDto {
  @IsString() name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) weekdays!: number[];
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsOptional() @IsInt() @Min(0) @Max(180) lateToleranceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(180) earlyLeaveToleranceMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) requiredWorkMinutes?: number;
}

export class UpdateWorkScheduleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) weekdays?: number[];
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsOptional() @IsInt() @Min(0) @Max(180) lateToleranceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(180) earlyLeaveToleranceMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) requiredWorkMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignEmployeeScheduleDto {
  @IsUUID() employeeId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class AssignDepartmentScheduleDto {
  @IsUUID() branchId!: string;
  @IsUUID() departmentId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
