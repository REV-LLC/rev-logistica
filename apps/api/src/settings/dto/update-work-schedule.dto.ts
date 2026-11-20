import { IsObject } from 'class-validator';

export class UpdateWorkScheduleDto {
  @IsObject()
  schedule: Record<string, unknown>;
}
