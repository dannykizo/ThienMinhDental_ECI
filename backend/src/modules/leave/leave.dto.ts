import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID() employeeId!: string;
  @IsIn(['ANNUAL', 'SICK', 'UNPAID', 'OTHER']) leaveType!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @MinLength(3) reason!: string;
}

export class ReviewLeaveRequestDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: string;
  @IsOptional() @IsString() reviewNote?: string;
}
