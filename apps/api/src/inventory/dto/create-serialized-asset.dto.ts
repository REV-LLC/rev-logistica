import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChargeType } from '@prisma/client';

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
  @IsNumber()
  unitWeight?: number;

  @IsOptional()
  @IsNumber()
  subrentalPrice?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lengthMeters?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closedLengthMeters?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extendedLengthMeters?: number;
}

export class SerializedAssetSubfamilyInput {
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

export class SerializedAssetInput {
  @IsOptional()
  @IsString()
  serialOrEngine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

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

  @IsOptional()
  @IsInt()
  internalNumber?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourMeter?: number;
}

export class CreateSerializedAssetDto {
  @ValidateNested()
  @Type(() => SerializedAssetFamilyInput)
  family: SerializedAssetFamilyInput;

  @ValidateNested()
  @Type(() => SerializedSkuInput)
  sku: SerializedSkuInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => SerializedAssetSubfamilyInput)
  subfamily?: SerializedAssetSubfamilyInput;

  @ValidateNested()
  @Type(() => SerializedAssetInput)
  asset: SerializedAssetInput;

  @IsUUID()
  ownerWarehouseId: string;

  @IsUUID()
  warehouseCurrentId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  providerPrice?: number;
}
