import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class MotorDetailsDto {
  @IsString() @MinLength(1) @MaxLength(160) brand!: string;
  @IsString() @MinLength(1) @MaxLength(160) model!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  powerHp!: number;
  @IsIn(['ELECTRICO', 'GASOLINA']) fuel!: 'ELECTRICO' | 'GASOLINA';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  compatibleEquipmentIds!: string[];
}
export class AssignEquipmentMotorDto {
  @IsInt() @Min(0) version!: number;
  @IsOptional() @IsUUID() motorId?: string | null;
  // Explicit null means the selector showed an unassigned motor.
  @ValidateIf((o) => !!o.motorId && o.expectedSourceId !== null)
  @IsUUID()
  expectedSourceId?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => MotorDetailsDto)
  newMotor?: MotorDetailsDto;
}
export class EditMotorDto extends MotorDetailsDto {
  @IsInt() @Min(0) version!: number;
}
