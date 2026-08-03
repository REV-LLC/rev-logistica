import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { DocumentStatus, DocumentType } from '@prisma/client';

export class CreateDocumentDto {
  @IsEnum(DocumentType)
  type: DocumentType;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

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

  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'El teléfono debe contener exactamente 10 dígitos',
  })
  recipientPhone: string;
}
