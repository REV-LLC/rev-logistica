import { IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';

export class DeleteBulkStockDto {
  @IsUUID()
  skuId: string;

  @IsUUID()
  ownerWarehouseId: string;

  @IsUUID()
  warehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsString()
  password: string;
}
