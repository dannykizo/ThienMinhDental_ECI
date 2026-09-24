import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  deviceName!: string;

  @IsIn(['WEB', 'MOBILE'])
  clientType!: 'WEB' | 'MOBILE';
}

export class RefreshSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(40)
  @MaxLength(256)
  refreshToken?: string;
}
