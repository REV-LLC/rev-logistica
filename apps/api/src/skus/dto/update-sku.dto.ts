import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SKU_CATEGORIES } from '../skus.constants';

export class UpdateSkuDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(SKU_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsUUID()
  assetFamilyId?: string;

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
  areaM2?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
