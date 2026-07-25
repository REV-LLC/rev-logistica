import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { NotificationRecipientDto } from '../../notifications/dto/notification.dto';

export class CreateVehicleDto {
  @IsString()
  plate: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

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
  @IsArray()
  @IsUUID('4', { each: true })
  driverIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientDto)
  notificationRecipients?: NotificationRecipientDto[];
}
