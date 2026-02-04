import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class CreateProviderReceiptItemDto {
  @IsUUID()
  skuId: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateProviderReceiptDto {
  @IsUUID()
  supplierWarehouseId: string;

  @IsUUID()
  custodyWarehouseId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProviderReceiptItemDto)
  items: CreateProviderReceiptItemDto[];
}
