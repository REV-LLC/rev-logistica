import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MovementType } from '@prisma/client';

export class GetInventoryLedgerDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  customerWorksiteId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  movementType?: MovementType;

  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class LedgerCursor {
  @IsString()
  createdAt!: string;

  @IsString()
  id!: string;
}

export const LEDGER_DEFAULT_TAKE = 50;
export const LEDGER_MAX_TAKE = 200;
