import { IsNumber, IsUUID, NotEquals, ValidateIf } from 'class-validator';

export class CreateInventoryAdjustItemDto {
  @ValidateIf((item) => !item.assetId)
  @IsUUID()
  skuId?: string;

  @ValidateIf((item) => !item.skuId)
  @IsUUID()
  assetId?: string;

  @ValidateIf((item) => !item.assetId)
  @IsNumber()
  @NotEquals(0)
  quantity?: number;

  @IsUUID()
  ownerWarehouseId: string;
}
