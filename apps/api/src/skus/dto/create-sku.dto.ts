import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { SkuControlType, SkuUnit } from '@prisma/client';

export class CreateSkuDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsEnum(SkuUnit)
  unit: SkuUnit;

  @IsEnum(SkuControlType)
  controlType: SkuControlType;

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
