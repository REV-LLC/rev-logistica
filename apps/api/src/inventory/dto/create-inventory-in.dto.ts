import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CreateInventoryOperationItemDto } from './create-inventory-operation-item.dto';

export class CreateInventoryInDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  customerWorksiteId: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryOperationItemDto)
  items: CreateInventoryOperationItemDto[];
}
