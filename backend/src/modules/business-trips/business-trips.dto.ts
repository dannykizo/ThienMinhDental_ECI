import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) memberIds!: string[];
}

export class TransitionBusinessTripDto {
  @IsIn(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) status!: string;
}
