import { IsOptional, IsString } from 'class-validator';

export class UpdateDocumentItemBillingDto {
  @IsOptional()
  @IsString()
  billingCutoffDate?: string | null;

  @IsOptional()
  @IsString()
  returnedAt?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}
