import { IsNumber, Min } from 'class-validator';

export class UpsertProviderSkuPriceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
}
