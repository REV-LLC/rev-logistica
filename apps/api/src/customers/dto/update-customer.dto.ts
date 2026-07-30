import { CustomerIdentityDocumentType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(CustomerIdentityDocumentType)
  identityDocumentType?: CustomerIdentityDocumentType;

  @IsOptional()
  @IsString()
  nitOrId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEmail()
  documentsEmail?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  billingPhone?: string;

  @IsOptional()
  @IsString()
  billingAlternatePhone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
