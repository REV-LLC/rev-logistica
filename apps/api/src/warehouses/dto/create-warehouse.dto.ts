import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { WarehouseType } from '@prisma/client';

export class CreateWarehouseDto {
  @IsString()
  name: string;

  @IsEnum(WarehouseType)
  type: WarehouseType;

  @IsUUID()
  ownerCompanyId: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
