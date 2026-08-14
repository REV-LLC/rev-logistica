import { IsUUID } from 'class-validator';

export class AssignAssetMotorDto {
  @IsUUID()
  motorId: string;
}
