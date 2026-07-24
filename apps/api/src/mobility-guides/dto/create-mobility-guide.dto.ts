import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMobilityGuideDto {
  @IsUUID()
  assetId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsDateString()
  issuedAt: string;

  @IsDateString()
  expiresAt: string;
}
