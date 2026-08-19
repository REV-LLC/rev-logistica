import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

class ProviderRemissionRequirementItemDto {
  @IsOptional()
  @IsUUID()
  ownerWarehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;
}

export class ProviderRemissionRequirementsDto {
  @IsEnum(DocumentType)
  type: DocumentType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderRemissionRequirementItemDto)
  items: ProviderRemissionRequirementItemDto[];
}
