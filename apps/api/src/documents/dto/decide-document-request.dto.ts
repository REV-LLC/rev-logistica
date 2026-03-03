import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideDocumentRequestDto {
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

