import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { CreateInventoryOperationItemDto } from './create-inventory-operation-item.dto';

export class CreateInventoryTransitDto {
  @IsUUID()
  customerWorksiteId: string;

  @IsUUID()
  documentId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryOperationItemDto)
  items: CreateInventoryOperationItemDto[];
}
