import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { DisciplinaryActionType } from './domain/disciplinary-action-policy.js';

export class CreateDisciplinaryActionDto {
  @IsUUID() employeeId!: string;
  @IsIn(['WARNING', 'SUSPENSION', 'DISCIPLINARY_ACTION']) actionType!: DisciplinaryActionType;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(5) @MaxLength(5000) reason!: string;
  @IsString() @MinLength(3) @MaxLength(5000) decision!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveTo?: string;
}

export class UpdateDisciplinaryActionDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsIn(['WARNING', 'SUSPENSION', 'DISCIPLINARY_ACTION']) actionType?: DisciplinaryActionType;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(5000) reason?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(5000) decision?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveTo?: string;
}

export class RevokeDisciplinaryActionDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
}
