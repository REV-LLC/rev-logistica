import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EmployeeRole, Role } from '@prisma/client';

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

  @IsOptional()
  @IsEmail()
  loginEmail?: string;

  @IsOptional()
  @IsString()
  loginPassword?: string;

  @IsOptional()
  @IsEnum(Role)
  loginRole?: Role;

  @IsOptional()
  @IsBoolean()
  loginActive?: boolean;
}
