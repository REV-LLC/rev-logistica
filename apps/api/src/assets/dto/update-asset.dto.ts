import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateAssetDto {
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
  @IsUUID()
  warehouseCurrentId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
