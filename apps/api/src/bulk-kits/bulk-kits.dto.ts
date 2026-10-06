import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class BulkKitSettingsDto {
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsString() @MaxLength(100) prefix?: string;
  @IsInt() @Min(0) version: number;
}
export class BulkKitEntryDto {
  @IsUUID() skuId: string;
  @IsInt() @Min(1) @Max(1000000) quantity: number;
}
export class SaveBulkKitDto {
  @IsString() @MaxLength(100) reference: string;
  @IsInt() @Min(0) version: number;
  @IsBoolean() active: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkKitEntryDto)
  entries: BulkKitEntryDto[];
}
