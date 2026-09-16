import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AccessoryKind,
  AccessoryScope,
  AccessoryMovementType,
} from '@prisma/client';

export class AccessoryDetailsDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsEnum(AccessoryKind) kind!: AccessoryKind;
  @IsOptional() @IsString() @MaxLength(80) internalCode?: string;
  @IsUUID() familyId!: string;
  @IsEnum(AccessoryScope) scope!: AccessoryScope;
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  subfamilyIds!: string[];
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  assetIds!: string[];
}

export class CreateAccessoryDto extends AccessoryDetailsDto {
  @IsUUID() ownerWarehouseId!: string;
  @IsUUID() warehouseId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @IsUUID() requestId!: string;
}

export class UpdateAccessoryDto extends AccessoryDetailsDto {
  @IsInt() @Min(0) version!: number;
  @IsBoolean() active!: boolean;
}

export class AccessoryLocationDto {
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() customerWorksiteId?: string;
  @IsOptional() @IsUUID() transitDocumentId?: string;
}

export class MoveAccessoryDto {
  @IsUUID() requestId!: string;
  @IsEnum(AccessoryMovementType) type!: AccessoryMovementType;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessoryLocationDto)
  from?: AccessoryLocationDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessoryLocationDto)
  to?: AccessoryLocationDto;
  @IsString() @MaxLength(1000) note!: string;
}
