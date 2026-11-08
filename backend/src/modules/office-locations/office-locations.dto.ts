import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  MAX_GEOFENCE_RADIUS_METERS,
  MAX_GPS_ACCURACY_THRESHOLD_METERS,
} from './domain/office-location-policy.js';

const optional = (_object: unknown, value: unknown): boolean => value !== undefined;

export class CreateOfficeLocationDto {
  @IsString() @Matches(/\S/u) @MaxLength(120) name!: string;
  @IsString() @Matches(/\S/u) @MaxLength(300) address!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @ValidateIf(optional) @IsIn(['OFFICE', 'EXTERNAL_WORKPLACE']) locationType?: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  @IsNumber() @IsLatitude() latitude!: number;
  @IsNumber() @IsLongitude() longitude!: number;
  @IsInt() @Min(1) @Max(MAX_GEOFENCE_RADIUS_METERS) radiusMeters!: number;
  @IsInt() @Min(1) @Max(MAX_GPS_ACCURACY_THRESHOLD_METERS) accuracyThresholdMeters!: number;
}

export class UpdateOfficeLocationDto {
  @ValidateIf(optional) @IsString() @Matches(/\S/u) @MaxLength(120) name?: string;
  @ValidateIf(optional) @IsString() @Matches(/\S/u) @MaxLength(300) address?: string;
  @IsOptional() @IsUUID() branchId?: string | null;
  @ValidateIf(optional) @IsIn(['OFFICE', 'EXTERNAL_WORKPLACE']) locationType?: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  @ValidateIf(optional) @IsNumber() @IsLatitude() latitude?: number;
  @ValidateIf(optional) @IsNumber() @IsLongitude() longitude?: number;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(MAX_GEOFENCE_RADIUS_METERS) radiusMeters?: number;
  @ValidateIf(optional) @IsInt() @Min(1) @Max(MAX_GPS_ACCURACY_THRESHOLD_METERS) accuracyThresholdMeters?: number;
  @ValidateIf(optional) @IsBoolean() isActive?: boolean;
}
