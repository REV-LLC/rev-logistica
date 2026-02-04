import { IsString, IsUUID, Matches } from 'class-validator';

export class GetInventorySummaryDto {
  @IsUUID()
  warehouseId: string;

  // YYYY-MM
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month: string;
}
