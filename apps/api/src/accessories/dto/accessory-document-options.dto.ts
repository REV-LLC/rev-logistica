import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AccessoryDocumentOptionsDto {
  @IsIn(['REMISSION', 'RETURN']) type!: 'REMISSION' | 'RETURN';
  @IsUUID() customerWorksiteId!: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsIn(['WAREHOUSE', 'ON_SITE']) deliveryMode?:
    | 'WAREHOUSE'
    | 'ON_SITE';
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) page: number =
    0;
}
