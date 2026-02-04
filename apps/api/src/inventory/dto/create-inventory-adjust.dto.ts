import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CreateInventoryAdjustItemDto } from './create-inventory-adjust-item.dto';

export class CreateInventoryAdjustDto {
  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryAdjustItemDto)
  items: CreateInventoryAdjustItemDto[];
}
