import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested } from 'class-validator';

export class ProviderReturnItemDto {
  @IsUUID()
  sourceLedgerId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreateProviderReturnDto {
  @IsUUID()
  sourceDocumentId: string;

  @IsUUID()
  providerWarehouseId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProviderReturnItemDto)
  items: ProviderReturnItemDto[];
}
