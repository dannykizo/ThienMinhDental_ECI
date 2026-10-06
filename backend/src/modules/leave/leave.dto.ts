import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOwnLeaveRequestDto {
  @IsOptional() @IsUUID() policyId?: string;
  @IsOptional() @IsString() @MaxLength(30) leaveType?: string;
  @IsOptional() @IsIn(['FULL_DAY', 'HALF_DAY', 'HOURS']) durationType?: 'FULL_DAY' | 'HALF_DAY' | 'HOURS';
  @IsOptional() @IsIn(['AM', 'PM']) halfDayPeriod?: 'AM' | 'PM';
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}

export class CreateLeaveRequestDto extends CreateOwnLeaveRequestDto {
  @IsUUID() employeeId!: string;
}

export class ReviewLeaveRequestDto {
  @IsOptional() @IsString() @MinLength(5) @MaxLength(2000) adminOverrideReason?: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) reviewNote?: string;
}

export class ConfirmLeaveRequestDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(2000) confirmationNote?: string;
}
export class SetLeaveRouteDto {
  @IsUUID() teamId!: string;
  @IsUUID() leaderUserId!: string;
  @IsUUID() headUserId!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}

export class CreateLeavePolicyDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,29}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsBoolean() balanceTrackingEnabled!: boolean;
  @IsInt() @Min(0) @Max(525600) annualEntitlementMinutes!: number;
  @IsInt() @Min(1) @Max(1440) dayMinutes!: number;
  @IsBoolean() carryOverEnabled!: boolean;
  @IsInt() @Min(0) @Max(525600) maxCarryOverMinutes!: number;
  @IsBoolean() allowHalfDay!: boolean;
  @IsBoolean() allowHourly!: boolean;
  @IsBoolean() allowApprovedCancellation!: boolean;
  @IsInt() @Min(0) @Max(365) minimumNoticeDays!: number;
}

export class UpdateLeavePolicyDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() balanceTrackingEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(525600) annualEntitlementMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) dayMinutes?: number;
  @IsOptional() @IsBoolean() carryOverEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(525600) maxCarryOverMinutes?: number;
  @IsOptional() @IsBoolean() allowHalfDay?: boolean;
  @IsOptional() @IsBoolean() allowHourly?: boolean;
  @IsOptional() @IsBoolean() allowApprovedCancellation?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(365) minimumNoticeDays?: number;
}

export class InitializeLeaveBalancesDto {
  @IsInt() @Min(2000) @Max(2200) year!: number;
  @IsOptional() @IsUUID() policyId?: string;
}

export class AdjustLeaveBalanceDto {
  @IsUUID() employeeId!: string;
  @IsUUID() policyId!: string;
  @IsInt() @Min(2000) @Max(2200) year!: number;
  @IsInt() @Min(-525600) @Max(525600) deltaMinutes!: number;
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}

export class CancelLeaveRequestDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}
