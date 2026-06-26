import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';

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
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerInitialWorksiteDto)
  initialWorksite?: CustomerInitialWorksiteDto;
}
