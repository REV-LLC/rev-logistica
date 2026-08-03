import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';

export class NotificationRecipientDto {
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

export class SetNotificationRecipientsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientDto)
  recipients: NotificationRecipientDto[];
}

export class ConfigureNotificationTopicDto {
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  eventType: string;

  @IsString()
  titleTemplate: string;

  @IsString()
  messageTemplate: string;

  @IsDateString()
  dueAt: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  warningDays?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationRecipientDto)
  recipients: NotificationRecipientDto[];
}
