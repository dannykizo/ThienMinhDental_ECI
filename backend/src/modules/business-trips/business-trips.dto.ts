import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateCustomerDto {
  @IsString() @MinLength(1) @MaxLength(180) name!: string;
  @IsString() @MinLength(1) @MaxLength(300) address!: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
}

export class UpdateCustomerDto {
  @ValidateIf((_o,v) => v !== undefined) @IsString() @MinLength(1) @MaxLength(180) name?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsString() @MinLength(1) @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string | null;
  @ValidateIf((_o,v) => v !== undefined) @IsBoolean() isActive?: boolean;
}

export class CreateBusinessTripDto {
  // Backward-compatible input for older Admin Web builds; Backend always ignores it.
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsString() @Matches(/\S/) @MaxLength(180) siteName!: string;
  @IsString() @Matches(/\S/) @MaxLength(300) siteAddress!: string;
  @IsDateString({strict:true}) startAt!: string;
  @IsDateString({strict:true}) endAt!: string;
  @IsString() @Matches(/\S/) content!: string;
  @IsBoolean() requiresPhoto!: boolean;
  @IsUUID() responsibleEmployeeId!: string;
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) memberIds!: string[];
}

export class UpdateBusinessTripDto {
  @IsOptional() @IsUUID() customerId?: string | null;
  @ValidateIf((_o,v) => v !== undefined) @IsString() @Matches(/\S/) @MaxLength(180) siteName?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsString() @Matches(/\S/) @MaxLength(300) siteAddress?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsDateString({strict:true}) startAt?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsDateString({strict:true}) endAt?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsString() @Matches(/\S/) content?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsBoolean() requiresPhoto?: boolean;
  @ValidateIf((_o,v) => v !== undefined) @IsUUID() responsibleEmployeeId?: string;
  @ValidateIf((_o,v) => v !== undefined) @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) memberIds?: string[];
}

export class TransitionBusinessTripDto {
  @IsIn(['ASSIGNED', 'CANCELLED']) status!: 'ASSIGNED' | 'CANCELLED';
  @IsOptional() @IsString() @MinLength(5) reason?: string;
}

export class StartBusinessTripDto {
  @IsNumber() @IsLatitude() latitude!: number;
  @IsNumber() @IsLongitude() longitude!: number;
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
