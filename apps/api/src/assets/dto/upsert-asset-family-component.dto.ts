import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertAssetFamilyComponentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  exclusiveGroup?: string | null;

  @IsUUID()
  componentAssetFamilyId: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumQuantity?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumQuantity?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
