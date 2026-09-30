import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ActivityNoteDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD.',
  })
  date: string;

  @IsUUID()
  customerWorksiteId: string;

  @IsUUID()
  assetId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Escribe una descripción.' })
  @MaxLength(5000)
  description: string;
}
