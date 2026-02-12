import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateWorksiteDto {
  @IsUUID()
  customerId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  alias?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
