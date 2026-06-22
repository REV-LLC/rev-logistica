import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateWorksiteAddressDto {
  @IsString()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  regionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
