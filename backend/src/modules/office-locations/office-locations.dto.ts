import { IsBoolean, IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  MAX_GEOFENCE_RADIUS_METERS,
  MAX_GPS_ACCURACY_THRESHOLD_METERS,
} from './domain/office-location-policy.js';

export class CreateOfficeLocationDto {
  @IsString() name!: string;
  @IsString() address!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsIn(['OFFICE', 'EXTERNAL_WORKPLACE']) locationType?: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsNumber() @Min(1) @Max(MAX_GEOFENCE_RADIUS_METERS) radiusMeters!: number;
  @IsNumber() @Min(1) @Max(MAX_GPS_ACCURACY_THRESHOLD_METERS) accuracyThresholdMeters!: number;
}

export class UpdateOfficeLocationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsUUID() branchId?: string | null;
  @IsOptional() @IsIn(['OFFICE', 'EXTERNAL_WORKPLACE']) locationType?: 'OFFICE' | 'EXTERNAL_WORKPLACE';
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(MAX_GEOFENCE_RADIUS_METERS) radiusMeters?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(MAX_GPS_ACCURACY_THRESHOLD_METERS) accuracyThresholdMeters?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
