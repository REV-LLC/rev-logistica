import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

const CONTACT_TYPES = ['GENERAL', 'BILLING', 'INFORMATION', 'COMMERCIAL', 'COLLECTIONS', 'OTHER'] as const;

export class CustomerContactDto {
  @IsString()
  @IsIn(CONTACT_TYPES)
  type: (typeof CONTACT_TYPES)[number];

  @IsString()
  @MaxLength(80)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PublicCustomerUpdateDto {
  @IsString()
  @MaxLength(100)
  updatedBy: string;

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CustomerContactDto)
  contacts: CustomerContactDto[];

  @IsString()
  @MaxLength(30)
  documentsPhone: string;

  @IsEmail()
  documentsEmail: string;
}
