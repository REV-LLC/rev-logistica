import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssetDto {
  @IsUUID()
  skuId: string;

  @IsUUID()
  warehouseOwnerId: string;

  @IsOptional()
  @IsUUID()
  warehouseCurrentId?: string;

  @IsOptional()
  @IsString()
  serialOrEngine?: string;

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
  @IsBoolean()
  active?: boolean;
}
