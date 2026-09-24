import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString() @MaxLength(180) name!: string;
  @IsString() @MaxLength(300) address!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
}

export class CreateBusinessTripDto {
  @IsString() @MaxLength(30) code!: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsString() siteName!: string;
  @IsString() siteAddress!: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsString() content!: string;
  @IsBoolean() requiresPhoto!: boolean;
  @IsUUID() responsibleEmployeeId!: string;
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) memberIds!: string[];
}

export class UpdateBusinessTripDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @MaxLength(180) siteName?: string;
  @IsOptional() @IsString() @MaxLength(300) siteAddress?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() requiresPhoto?: boolean;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) memberIds?: string[];
}

export class TransitionBusinessTripDto {
  @IsIn(['ASSIGNED', 'CANCELLED']) status!: 'ASSIGNED' | 'CANCELLED';
  @IsOptional() @IsString() @MinLength(5) reason?: string;
}

export class StartBusinessTripDto {
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) accuracyMeters?: number;
  @IsOptional() @IsDateString() deviceTime?: string;
}

export class CompleteBusinessTripDto extends StartBusinessTripDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsString() @MaxLength(500) evidenceImageReference?: string;
  @IsOptional() @IsDateString() evidenceCapturedAt?: string;
}

export class UploadBusinessTripEvidenceDto {
  @IsUUID() evidenceId!: string;
}
