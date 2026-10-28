import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum BalanceReportKind {
  GENERAL = 'general',
  WORKSITES = 'worksites',
  CUSTOMERS = 'customers',
  PROVIDERS = 'providers',
  WAREHOUSES = 'warehouses',
}

export enum BalanceOwnership {
  ALL = 'ALL',
  INTERNAL = 'INTERNAL',
  PROVIDER = 'PROVIDER',
}

export class GetBalanceReportDto {
  @IsEnum(BalanceReportKind)
  report: BalanceReportKind = BalanceReportKind.GENERAL;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  customerWorksiteId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsEnum(BalanceOwnership)
  ownership: BalanceOwnership = BalanceOwnership.ALL;
}
