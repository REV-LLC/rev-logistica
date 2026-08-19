import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { COLOMBIAN_PHONE_INPUT_PATTERN } from '../../messaging/colombian-phone';

class CreateDocumentRequestItemDto {
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

export class CreateDocumentRequestDto {
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
  @IsString()
  @Matches(COLOMBIAN_PHONE_INPUT_PATTERN, {
    message: 'El teléfono debe contener exactamente 10 dígitos',
  })
  recipientPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(COLOMBIAN_PHONE_INPUT_PATTERN, {
    each: true,
    message: 'Cada teléfono debe contener exactamente 10 dígitos',
  })
  recipientPhones?: string[];

  @IsOptional()
  @IsBoolean()
  sendWhatsapp?: boolean;

  @IsOptional()
  @IsString()
  receivedSignature?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentRequestItemDto)
  items: CreateDocumentRequestItemDto[];
}
