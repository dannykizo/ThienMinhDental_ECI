import { IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateOvertimeDto {
  @IsUUID() submissionId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) workDate!: string;
  @IsInt() @Min(1) @Max(1440) requestedMinutes!: number;
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
  @IsString() @MinLength(5) @MaxLength(2000) workContent!: string;
}
export class SetOvertimeRouteDto {
  @IsUUID() teamId!: string;
  @IsUUID() leaderUserId!: string;
  @IsUUID() headUserId!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}
export class ConfirmOvertimeDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @ValidateIf((_o, value) => value !== undefined) @IsString() @MaxLength(2000) confirmationNote?: string;
}
export class ReviewOvertimeDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsIn(['APPROVED','REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @ValidateIf((_o, value) => value !== undefined) @IsString() @MaxLength(2000) reviewNote?: string;
  @ValidateIf((_o, value) => value !== undefined) @IsString() @MinLength(5) @MaxLength(2000) adminOverrideReason?: string;
}
