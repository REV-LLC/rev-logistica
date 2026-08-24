import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateOwnerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nitOrId?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
