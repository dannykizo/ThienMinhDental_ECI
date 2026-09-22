import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) body!: string;
  @IsIn(['ALL', 'DEPARTMENT']) audienceType!: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class TransitionAnnouncementDto {
  @IsIn(['PUBLISHED', 'CANCELLED']) status!: string;
}
