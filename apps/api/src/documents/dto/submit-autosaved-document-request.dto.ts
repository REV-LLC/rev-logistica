import { IsBoolean, IsOptional } from 'class-validator';

export class SubmitAutosavedDocumentRequestDto {
  @IsOptional()
  @IsBoolean()
  sendWhatsapp?: boolean;
}
