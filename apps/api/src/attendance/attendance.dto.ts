import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class PunchDto {
  @IsUUID('4') requestId: string;
  @IsIn(['CHECK_IN', 'CHECK_OUT']) kind: 'CHECK_IN' | 'CHECK_OUT';
  @IsOptional() @IsUUID('4') customerWorksiteId?: string;
  @IsOptional() @IsUUID('4') attendanceId?: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100000) accuracyMeters: number;
  @IsDateString() locationCapturedAt: string;
}
export class ApproveReferenceDto {
  @Matches(/^[a-f0-9]{64}$/) photoHash: string;
}
export class ReviewDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(5) @MaxLength(1000) note: string;
}
export class SiteLocationDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsNumber({ maxDecimalPlaces: 0 }) @Min(20) @Max(5000) radiusMeters: number;
}
