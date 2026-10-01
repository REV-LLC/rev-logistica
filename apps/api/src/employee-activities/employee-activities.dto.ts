import { EmployeeActivityType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsString,
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
  @IsEnum(EmployeeActivityType)
  type?: EmployeeActivityType;

  @ValidateIf((value) => value.type && value.type !== 'WORKSITE')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Selecciona la fecha de fin.' })
  endDate?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD.',
  })
  date: string;

  @ValidateIf((value) => !value.type || value.type === 'WORKSITE')
  @IsUUID()
  customerWorksiteId?: string;

  @ValidateIf((value) => !value.type || value.type === 'WORKSITE')
  @IsUUID()
  assetId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Escribe una descripción.' })
  @MaxLength(5000)
  description: string;
}
