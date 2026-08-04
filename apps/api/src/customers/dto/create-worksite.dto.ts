import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateWorksiteDto {
  @IsUUID()
  customerId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  externalCode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
