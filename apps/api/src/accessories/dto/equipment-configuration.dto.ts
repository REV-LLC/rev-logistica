import { Type } from 'class-transformer';
import { AccessoryKind, EquipmentPartRole } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class NewConfigurationPartDto {
  @IsString() @MaxLength(160) name!: string;
  @IsEnum(AccessoryKind) kind!: AccessoryKind;
  @IsInt() @Min(1) @Max(1000000) initialQuantity!: number;
  // An exclusive component belongs to this physical equipment, even when detached.
  @IsBoolean() exclusive!: boolean;
  @IsOptional() @IsIn(['PARENT', 'SUBFAMILY', 'FAMILY']) compatibility?:
    | 'PARENT'
    | 'SUBFAMILY'
    | 'FAMILY';
}

export class EquipmentConfigurationEntryDto {
  @IsUUID() id!: string;
  @IsEnum(EquipmentPartRole) role!: EquipmentPartRole;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() skuId?: string;
  @IsOptional() @IsBoolean() recommendation?: boolean;
  @IsOptional() @IsUUID() accessoryId?: string;
  @IsOptional() @IsUUID() familyId?: string;
  // Null is a direct recommendation from the principal equipment; a UUID is
  // another family in this same recommended route. Never a concrete asset.
  @IsOptional() @IsUUID() templateParentFamilyId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) maximumQuantity?: number | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => NewConfigurationPartDto)
  newPart?: NewConfigurationPartDto;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @IsBoolean() defaultIncluded!: boolean;
  @IsBoolean() required!: boolean;
}

export class EquipmentConfigurationDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsInt() @Min(0) version!: number;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EquipmentConfigurationEntryDto)
  entries!: EquipmentConfigurationEntryDto[];
}
