import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const optional = (_object: unknown, value: unknown): boolean => value !== undefined;

export class CreateWorkScheduleDto {
  @IsString() @MaxLength(120) @Matches(/\S/u) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) weekdays!: number[];
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @ValidateIf(optional) @IsInt() @Min(0) @Max(180) lateToleranceMinutes?: number;
  @ValidateIf(optional) @IsInt() @Min(0) @Max(180) earlyLeaveToleranceMinutes?: number;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(1440) requiredWorkMinutes?: number;
}

export class UpdateWorkScheduleDto {
  @ValidateIf(optional) @IsString() @MaxLength(120) @Matches(/\S/u) name?: string;
  @ValidateIf(optional) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) weekdays?: number[];
  @ValidateIf(optional) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @ValidateIf(optional) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @ValidateIf(optional) @IsInt() @Min(0) @Max(180) lateToleranceMinutes?: number;
  @ValidateIf(optional) @IsInt() @Min(0) @Max(180) earlyLeaveToleranceMinutes?: number;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(1440) requiredWorkMinutes?: number;
  @ValidateIf(optional) @IsBoolean() isActive?: boolean;
}

export class AssignEmployeeScheduleDto {
  @IsUUID() employeeId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) effectiveFrom!: string;
  @ValidateIf(optional) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) effectiveTo?: string;
}

export class AssignDepartmentScheduleDto {
  @IsUUID() branchId!: string;
  @IsUUID() departmentId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) effectiveFrom!: string;
  @ValidateIf(optional) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) effectiveTo?: string;
}
