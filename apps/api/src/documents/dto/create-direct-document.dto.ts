import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsNumber, IsOptional,
  IsPositive, IsString, IsUUID, Matches, Validate, ValidateIf, ValidateNested,
  ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface,
} from 'class-validator';
import { DocumentStatus, DocumentType, InventorySourceMode } from '@prisma/client';
import { COLOMBIAN_PHONE_INPUT_PATTERN } from '../../messaging/colombian-phone';

@ValidatorConstraint({ name: 'directDocumentItemShape', async: false })
class DirectDocumentItemShape implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const item = args.object as DirectDocumentItemDto;
    return Boolean(item.skuId) !== Boolean(item.assetId)
      && (!item.assetId || item.quantity === undefined || item.quantity === 1);
  }
  defaultMessage() {
    return 'Cada ítem debe identificar un artículo por cantidad o un solo equipo, no ambos';
  }
}

export class DirectDocumentItemDto {
  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ValidateIf((item: DirectDocumentItemDto) => Boolean(item.skuId) || item.quantity !== undefined)
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsUUID()
  @Validate(DirectDocumentItemShape)
  ownerWarehouseId: string;
}

export class CreateDirectDocumentDto {
  @IsIn([DocumentType.REMISSION, DocumentType.RETURN])
  type: DocumentType;

  @IsOptional()
  @IsIn([DocumentStatus.CONFIRMED])
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ValidateIf((document: CreateDirectDocumentDto) => document.type === DocumentType.REMISSION
    || document.inventorySourceMode !== undefined)
  @IsEnum(InventorySourceMode)
  inventorySourceMode?: InventorySourceMode;

  @IsUUID()
  customerWorksiteId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @Matches(COLOMBIAN_PHONE_INPUT_PATTERN)
  recipientPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(COLOMBIAN_PHONE_INPUT_PATTERN, { each: true })
  recipientPhones?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DirectDocumentItemDto)
  items: DirectDocumentItemDto[];
}
