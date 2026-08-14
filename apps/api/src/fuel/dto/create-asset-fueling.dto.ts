import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateAssetFuelingDto {
  @IsUUID()
  worksiteId: string;

  @IsUUID()
  assetId: string;

  @IsDateString()
  fueledAt: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  quantityCans: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourMeter: number;

  @IsOptional()
  @IsUUID()
  operatorEmployeeId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
