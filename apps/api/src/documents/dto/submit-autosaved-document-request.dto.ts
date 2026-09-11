import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SubmitAutosavedDocumentRequestDto {
  @IsOptional()
  @IsString()
  tabletEmployeeToken?: string;
  @IsOptional()
  @IsBoolean()
  sendWhatsapp?: boolean;
}
