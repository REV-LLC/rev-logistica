import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class CreateDocumentDto {
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
}
