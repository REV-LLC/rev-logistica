import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransportCostEstimateDto {
  @IsOptional()
  @IsString()
  routeProvider?: 'mapbox' | 'haversine';

  @IsOptional()
  @IsString()
  routeProfile?: string;

  @IsOptional()
  @IsString()
  originAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originLng?: number;

  @IsOptional()
  @IsString()
  destinationAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationLng?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ratePerKm!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  roundToNearest?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceKmOverride?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
