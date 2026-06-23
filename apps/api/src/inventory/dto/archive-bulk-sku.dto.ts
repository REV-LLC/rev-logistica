import { IsString, IsUUID } from 'class-validator';

export class ArchiveBulkSkuDto {
  @IsUUID()
  skuId: string;

  @IsString()
  password: string;
}
