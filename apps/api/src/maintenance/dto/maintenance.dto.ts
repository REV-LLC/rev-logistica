import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class MaintenanceRecipientDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;
}

export class CreateMaintenanceItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  intervalHours: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  warningHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baselineHours?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MaintenanceRecipientDto)
  recipients: MaintenanceRecipientDto[];
}

export class CreateMaintenancePlanDto {
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateMaintenanceItemDto)
  items: CreateMaintenanceItemDto[];
}

export class UpdateMaintenancePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMaintenanceItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  intervalHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  warningHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baselineHours?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MaintenanceRecipientDto)
  recipients?: MaintenanceRecipientDto[];
}

export class RecordAssetHoursDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hours: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsUUID()
  evidenceFileObjectId?: string;
}

export class CompleteMaintenanceDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  completedAtHours?: number;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
