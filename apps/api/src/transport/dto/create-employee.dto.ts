import { IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EmployeeRole } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  name: string;

  @IsEnum(EmployeeRole)
  role: EmployeeRole;

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
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds?: string[];
}
