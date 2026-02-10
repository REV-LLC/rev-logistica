import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SKU_CATEGORIES } from '../../skus/skus.constants';

export class SerializedAssetFamilyInput {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class SerializedSkuInput {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(SKU_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsNumber()
  unitWeight?: number;
}

export class SerializedAssetInput {
  @IsString()
  serialOrEngine: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  fuel?: string;

  @IsOptional()
  @IsUUID()
  imageFileObjectId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateSerializedAssetDto {
  @ValidateNested()
  @Type(() => SerializedAssetFamilyInput)
  family: SerializedAssetFamilyInput;

  @ValidateNested()
  @Type(() => SerializedSkuInput)
  sku: SerializedSkuInput;

  @ValidateNested()
  @Type(() => SerializedAssetInput)
  asset: SerializedAssetInput;

  @IsUUID()
  ownerWarehouseId: string;

  @IsUUID()
  warehouseCurrentId: string;
}
