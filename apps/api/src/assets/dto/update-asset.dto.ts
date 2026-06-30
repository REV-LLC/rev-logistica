import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

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
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsString()
  fuel?: string;

  @IsOptional()
  @IsUUID()
  warehouseCurrentId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsUUID()
  imageFileObjectId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
