import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type { AppointmentType, ManagementRole } from '../domain/management-access.js';

export class CreateTeamDto {
  @IsUUID() departmentId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
}

export class UpdateTeamDto {
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsBoolean() isActive!: boolean;
}

export class AddTeamMemberDto {
  @IsUUID() employeeId!: string;
}

export class ReasonDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}

export class CreateManagementGrantDto {
  @IsUUID() employeeId!: string;
  @IsIn(['DEPARTMENT_HEAD', 'TEAM_LEADER']) roleCode!: ManagementRole;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsIn(['TEMPORARY', 'OFFICIAL']) appointmentType!: AppointmentType;
  @IsDateString({ strict: true }) validFrom!: string;
  @IsOptional() @IsDateString({ strict: true }) validUntil?: string | null;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
