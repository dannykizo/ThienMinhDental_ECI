import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCatalogDto {
  @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
}

export class CatalogDecisionDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) confirmationToken!: string;
}

export class UpdateCatalogDto extends CatalogDecisionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30) code?: string;
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsBoolean() isActive!: boolean;
}
