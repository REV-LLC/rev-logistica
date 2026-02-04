import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
  @IsBoolean()
  active?: boolean;
}
