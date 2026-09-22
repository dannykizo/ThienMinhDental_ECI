import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLookupDto {
  @IsString() @MaxLength(30) code!: string;
  @IsString() @MaxLength(150) name!: string;
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
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) temporaryPassword?: string;
  @IsOptional() @IsIn(['ADMIN', 'CHIEF_ACCOUNTANT', 'AREA_MANAGER', 'MANAGER', 'EMPLOYEE']) role?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID(undefined, { each: true }) scopeBranchIds?: string[];
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsIn(['OFFICE', 'TECHNICAL']) employeeType?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrganizationAssignmentDto)
  organizationAssignments?: OrganizationAssignmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID(undefined, { each: true }) scopeBranchIds?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
