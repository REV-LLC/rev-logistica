import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { WarehouseType } from '@prisma/client';

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(WarehouseType)
  type?: WarehouseType;

  @IsOptional()
  @IsUUID()
  ownerCompanyId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
