import { IsOptional, IsString, MinLength } from 'class-validator';

export class LockAttendancePeriodDto {
  @IsOptional() @IsString() @MinLength(5) reason?: string;
}

export class ReopenAttendancePeriodDto {
  @IsString() @MinLength(5) reason!: string;
}
