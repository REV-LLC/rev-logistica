import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CatalogOptionInputDto {
  @IsString()
  @MaxLength(120)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCatalogOptionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CatalogOptionInputDto)
  options: CatalogOptionInputDto[];
}
