import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssetSubfamilyDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;
}
