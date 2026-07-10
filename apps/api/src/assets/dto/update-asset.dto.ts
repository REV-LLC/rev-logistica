import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  brand?: string | null;

  @IsOptional()
  @IsString()
  model?: string | null;

  @IsOptional()
  @IsNumber()
  year?: number | null;

  @IsOptional()
  @IsString()
  fuel?: string | null;

  @IsOptional()
  @IsUUID()
  warehouseCurrentId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsNumber()
  weight?: number | null;

  @IsOptional()
  @IsUUID()
  imageFileObjectId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
