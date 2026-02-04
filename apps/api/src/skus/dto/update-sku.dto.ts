import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { SkuControlType, SkuUnit } from '@prisma/client';

export class UpdateSkuDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(SkuUnit)
  unit?: SkuUnit;

  @IsOptional()
  @IsEnum(SkuControlType)
  controlType?: SkuControlType;

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
  @IsBoolean()
  active?: boolean;
}
