import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SKU_CATEGORIES } from '../skus.constants';

export class CreateSkuDto {
  @IsString()
  name: string;

  @IsString()
  @IsIn(SKU_CATEGORIES)
  category: string;

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
  areaM2?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
