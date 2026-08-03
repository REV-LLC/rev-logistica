import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType } from '@prisma/client';

class UpdateDocumentRequestItemDto {
  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  ownerWarehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  requestedTag?: string;

  @IsOptional()
  @IsString()
  conditionNote?: string;
}

export class UpdateDocumentRequestDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  customerWorksiteId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'El teléfono debe contener exactamente 10 dígitos',
  })
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  receivedSignature?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateDocumentRequestItemDto)
  items: UpdateDocumentRequestItemDto[];
}
