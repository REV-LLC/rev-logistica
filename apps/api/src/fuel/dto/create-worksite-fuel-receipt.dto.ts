import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateWorksiteFuelReceiptDto {
  @IsUUID()
  worksiteId: string;

  @IsDateString()
  receivedAt: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  quantityCans: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
