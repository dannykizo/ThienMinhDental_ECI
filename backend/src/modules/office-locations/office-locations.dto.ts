import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateOfficeLocationDto {
  @IsString() name!: string;
  @IsString() address!: string;
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsNumber() @Min(10) @Max(5000) radiusMeters!: number;
  @IsNumber() @Min(5) @Max(1000) accuracyThresholdMeters!: number;
}

export class UpdateOfficeLocationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(5000) radiusMeters?: number;
  @IsOptional() @IsNumber() @Min(5) @Max(1000) accuracyThresholdMeters?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
