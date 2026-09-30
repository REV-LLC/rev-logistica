import { IsOptional, IsUUID } from 'class-validator';

/** Stable line identities, independent of catalogue entries or draft row IDs. */
export class DocumentCompositionItemDto {
  @IsOptional() @IsUUID() compositionNodeId?: string;
  @IsOptional() @IsUUID() parentCompositionNodeId?: string;
  @IsOptional() @IsUUID() sourceDocumentItemId?: string;
  @IsOptional() @IsUUID() parentSourceDocumentItemId?: string;
}
