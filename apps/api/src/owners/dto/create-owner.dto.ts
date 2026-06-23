import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateOwnerDto {
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
  @IsBoolean()
  active?: boolean;
}
