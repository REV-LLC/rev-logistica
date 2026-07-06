import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChargeType } from '@prisma/client';

export class BulkAssetFamilyInput {
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

export class BulkSkuInput {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  unitWeight?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  subrentalPrice?: number;

  @IsOptional()
  @IsNumber()
  replacementValue?: number;

  @IsOptional()
  @IsEnum(ChargeType)
  chargeType?: ChargeType;

  @IsOptional()
  @IsNumber()
  minimumChargeHours?: number;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsNumber()
  areaM2?: number;
}

export class CreateBulkAdjustmentDto {
  @ValidateNested()
  @Type(() => BulkAssetFamilyInput)
  family: BulkAssetFamilyInput;

  @ValidateNested()
  @Type(() => BulkSkuInput)
  sku: BulkSkuInput;

  @IsUUID()
  ownerWarehouseId: string;

  @IsUUID()
  warehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}
