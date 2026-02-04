import { IsNumber, IsPositive, IsUUID, ValidateIf } from 'class-validator';

export class CreateInventoryOperationItemDto {
  @ValidateIf((item) => !item.assetId)
  @IsUUID()
  skuId?: string;

  @ValidateIf((item) => !item.skuId)
  @IsUUID()
  assetId?: string;

  @ValidateIf((item) => !item.assetId)
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsUUID()
  ownerWarehouseId: string;
}
