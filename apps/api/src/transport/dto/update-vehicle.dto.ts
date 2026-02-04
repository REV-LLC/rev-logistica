import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  capacity?: string;

  @IsOptional()
  @IsDateString()
  soatVigencia?: string;

  @IsOptional()
  @IsDateString()
  tecnomecanicaVigencia?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  driverIds?: string[];
}
