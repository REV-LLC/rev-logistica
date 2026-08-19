import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
import { DocumentType } from '@prisma/client';
import { COLOMBIAN_PHONE_INPUT_PATTERN } from '../../messaging/colombian-phone';

class AutosaveDocumentRequestItemDto {
  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  componentParentAssetId?: string;

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

export class AutosaveDocumentRequestDto {
  @IsEnum(DocumentType)
  type: DocumentType;

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
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(COLOMBIAN_PHONE_INPUT_PATTERN, {
    each: true,
    message: 'Cada teléfono debe contener exactamente 10 dígitos',
  })
  recipientPhones?: string[];

  @IsOptional()
  @IsString()
  receivedSignature?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutosaveDocumentRequestItemDto)
  items?: AutosaveDocumentRequestItemDto[];
}
