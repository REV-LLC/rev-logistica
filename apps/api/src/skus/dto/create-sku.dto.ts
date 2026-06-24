import {
  IsEnum,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ChargeType } from '@prisma/client';

export class CreateSkuDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsUUID()
  assetFamilyId: string;

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
  @IsNumber()
  areaM2?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
