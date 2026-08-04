import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProviderMobilityGuideDto {
  @IsUUID()
  providerId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  machineReference: string;

  @IsDateString()
  issuedAt: string;

  @IsDateString()
  expiresAt: string;
}
