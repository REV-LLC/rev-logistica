import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateLoanDescriptionDto {
  @IsString()
  @Matches(/\S/, { message: 'Escribe una descripción.' })
  @MaxLength(500)
  detail!: string;
}
