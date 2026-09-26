import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OperationsAuditQueryDto {
  @IsOptional() @IsString() @MaxLength(80) resourceType?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit = 100;
}
