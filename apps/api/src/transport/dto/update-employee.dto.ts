import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EmployeeRole } from '@prisma/client';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(EmployeeRole)
  role?: EmployeeRole;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds?: string[];
}
