import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteAssetDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
