import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLookupDto {
  @IsString() @MaxLength(30) code!: string;
  @IsString() @MaxLength(150) name!: string;
}

export class CreateEmployeeDto {
  @IsString() @MaxLength(30) employeeCode!: string;
  @IsString() @MaxLength(150) fullName!: string;
  @IsIn(['OFFICE', 'TECHNICAL']) employeeType!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) temporaryPassword?: string;
  @IsOptional() @IsIn(['ADMIN', 'MANAGER', 'EMPLOYEE']) role?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional() @IsIn(['OFFICE', 'TECHNICAL']) employeeType?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
