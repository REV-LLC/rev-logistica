import { Type } from 'class-transformer';
import { CustomerIdentityDocumentType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CustomerInitialWorksiteDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCustomerDto {
  @IsString()
  name: string;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerInitialWorksiteDto)
  initialWorksite?: CustomerInitialWorksiteDto;
}
