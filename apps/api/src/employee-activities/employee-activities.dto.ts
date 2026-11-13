import { EmployeeActivityType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsIn,
  IsArray,
  IsISO8601,
  ArrayMinSize,
  ArrayMaxSize,
  IsEnum,
  IsOptional,
  ValidateIf,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ActivityNoteDto {
  @IsOptional()
  @IsISO8601()
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'Incluye fecha, hora y zona horaria.',
  })
  verifiedEnteredAt?: string;

  @IsOptional()
  @IsISO8601()
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'Incluye fecha, hora y zona horaria.',
  })
  verifiedLeftAt?: string | null;

  @IsOptional()
  @IsEnum(EmployeeActivityType)
  type?: EmployeeActivityType;

  @ValidateIf((value) =>
    ['ABSENCE', 'MEDICAL_LEAVE', 'VACATION'].includes(value.type),
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Selecciona la fecha de fin.' })
  endDate?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD.',
  })
  date: string;

  @ValidateIf((value) => !value.type || value.type === 'WORKSITE')
  @IsUUID()
  customerWorksiteId?: string;

  @ValidateIf((value) => value.type === 'WAREHOUSE')
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Escribe una descripción.' })
  @MaxLength(5000)
  description: string;
}

export class ReviewActivityDto {
  @IsIn(['CONFIRM', 'DISMISS'])
  action: 'CONFIRM' | 'DISMISS';
}

export class ReviewActivityBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids: string[];
}
