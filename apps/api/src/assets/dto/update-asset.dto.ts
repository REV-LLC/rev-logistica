import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  registrationNumber?: string | null;

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

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourMeter?: number;
}
