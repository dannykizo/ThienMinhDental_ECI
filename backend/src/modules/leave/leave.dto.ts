import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateOwnLeaveRequestDto {
  @IsIn(['ANNUAL', 'SICK', 'UNPAID', 'OTHER']) leaveType!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}

export class CreateLeaveRequestDto extends CreateOwnLeaveRequestDto {
  @IsUUID() employeeId!: string;
}

export class ReviewLeaveRequestDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) reviewNote?: string;
}
