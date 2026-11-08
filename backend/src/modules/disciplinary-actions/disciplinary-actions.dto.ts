import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import type { DisciplinaryActionType } from './domain/disciplinary-action-policy.js';

export class DisciplinaryContentDto {
  @IsIn(['WARNING', 'SUSPENSION', 'DISCIPLINARY_ACTION']) actionType!: DisciplinaryActionType;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(5) @MaxLength(5000) reason!: string;
  @IsString() @MinLength(3) @MaxLength(5000) decision!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveTo?: string | null;
}

export class CreateDisciplinaryActionDto extends DisciplinaryContentDto {
  @IsUUID() employeeId!: string;
}

export class DisciplinaryGroupTargetDto {
  @IsIn(['TEAM', 'DEPARTMENT']) targetType!: 'TEAM' | 'DEPARTMENT';
  @IsUUID() targetId!: string;
}

export class IssueDisciplinaryGroupDto extends DisciplinaryContentDto {
  @IsUUID() requestId!: string;
  @IsIn(['TEAM', 'DEPARTMENT']) targetType!: 'TEAM' | 'DEPARTMENT';
  @IsUUID() targetId!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) rosterToken!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000) @ArrayUnique() @IsUUID(undefined, { each: true }) employeeIds!: string[];
}

export class UpdateDisciplinaryActionDto {
  @ValidateIf((_, value) => value !== undefined) @IsUUID() employeeId?: string;
  @ValidateIf((_, value) => value !== undefined) @IsIn(['WARNING', 'SUSPENSION', 'DISCIPLINARY_ACTION']) actionType?: DisciplinaryActionType;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MinLength(5) @MaxLength(5000) reason?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MinLength(3) @MaxLength(5000) decision?: string;
  @ValidateIf((_, value) => value !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveTo?: string | null;
}

export class RevokeDisciplinaryActionDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}
