import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateBulkStockDto {
  @IsUUID()
  skuId: string;

  @IsUUID()
  ownerWarehouseId: string;

  @IsUUID()
  warehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}
