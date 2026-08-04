import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyDocumentItemsCutoffDto {
  @IsString()
  @IsNotEmpty()
  billingCutoffDate!: string;
}
