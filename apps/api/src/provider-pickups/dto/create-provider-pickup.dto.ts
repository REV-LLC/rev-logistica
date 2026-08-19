import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ProviderPickupItemDto {
  @ValidateIf((item) => !item.assetId)
  @IsUUID()
  skuId?: string;

  @ValidateIf((item) => !item.skuId)
  @IsUUID()
  assetId?: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreateProviderPickupDto {
  @IsUUID()
  providerWarehouseId: string;

  @IsUUID()
  destinationWarehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProviderPickupItemDto)
  items: ProviderPickupItemDto[];
}
