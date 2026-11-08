import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/domain/password-policy.js';

export class CreateLookupDto {
  @IsString() @MaxLength(30) code!: string;
  @IsString() @MaxLength(150) name!: string;
}

export class EmployeeListQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100) pageSize = 25;
}

export class OrganizationAssignmentDto {
  @IsUUID() branchId!: string;
  @IsUUID() departmentId!: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() managerEmployeeId?: string;
  @IsBoolean() isPrimary!: boolean;
}

export class CreateEmployeeDto {
  @IsString() @MaxLength(30) employeeCode!: string;
  @IsString() @MaxLength(150) fullName!: string;
  @IsIn(['OFFICE', 'TECHNICAL']) employeeType!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrganizationAssignmentDto)
  organizationAssignments!: OrganizationAssignmentDto[];
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(PASSWORD_MIN_LENGTH) @MaxLength(PASSWORD_MAX_LENGTH) temporaryPassword?: string;
  @IsOptional() @IsIn(['ADMIN', 'CHIEF_ACCOUNTANT', 'AREA_MANAGER', 'MANAGER', 'EMPLOYEE']) role?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID(undefined, { each: true }) scopeBranchIds?: string[];
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsIn(['OFFICE', 'TECHNICAL']) employeeType?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsDateString() hireDate?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrganizationAssignmentDto)
  organizationAssignments?: OrganizationAssignmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID(undefined, { each: true }) scopeBranchIds?: string[];
}

export class ChangeEmployeeStatusDto {
  @IsBoolean() isActive!: boolean;
  @IsDateString() effectiveDate!: string;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class ResetEmployeePasswordDto {
  @IsString() @MinLength(PASSWORD_MIN_LENGTH) @MaxLength(PASSWORD_MAX_LENGTH) newPassword!: string;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class DeleteEmployeeDto {
  @IsString() @MinLength(1) @MaxLength(30) employeeCode!: string;
  @IsString() @MinLength(64) @MaxLength(64) confirmationToken!: string;
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
