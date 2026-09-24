import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(10000) body!: string;
  @IsIn(['DEPARTMENT', 'EMPLOYEE']) audienceType!: 'DEPARTMENT' | 'EMPLOYEE';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsBoolean() requiresAcknowledgement!: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(10000) body?: string;
  @IsOptional() @IsIn(['DEPARTMENT', 'EMPLOYEE']) audienceType?: 'DEPARTMENT' | 'EMPLOYEE';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsBoolean() requiresAcknowledgement?: boolean;
}

export class TransitionAnnouncementDto {
  @IsIn(['PUBLISHED', 'CANCELLED', 'WITHDRAWN']) status!: 'PUBLISHED' | 'CANCELLED' | 'WITHDRAWN';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class RegisterPushDeviceDto {
  @IsString() @MinLength(8) @MaxLength(200) deviceId!: string;
  @IsIn(['ANDROID']) platform!: 'ANDROID';
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
}

export class UnregisterPushDeviceDto {
  @IsString() @MinLength(8) @MaxLength(200) deviceId!: string;
}
