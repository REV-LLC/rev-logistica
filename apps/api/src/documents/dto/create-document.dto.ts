import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { COLOMBIAN_PHONE_INPUT_PATTERN } from '../../messaging/colombian-phone';

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
}
