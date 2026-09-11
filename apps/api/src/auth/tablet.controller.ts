import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { TabletService } from './tablet.service';

class TabletAccountDto {
  @IsString()
  @Matches(/\S/, { message: 'Ingresa el usuario de acceso.' })
  identifier: string;
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password?: string;
  @IsUUID() warehouseId: string;
  @IsBoolean() active: boolean;
}
class EmployeePinDto {
  @ValidateIf((_object, value) => value !== null)
  @Matches(/^\d{4}$/, {
    message: 'El PIN debe contener exactamente 4 dígitos.',
  })
  pin: string | null;
}
class VerifyTabletPinDto {
  @Matches(/^\d{4}$/, {
    message: 'El PIN debe contener exactamente 4 dígitos.',
  })
  pin: string;
  @IsOptional() @IsUUID() documentId?: string;
}
@Controller('warehouse-tablets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TabletController {
  constructor(private readonly tablets: TabletService) {}
  @Get() list() {
    return this.tablets.listAccounts();
  }
  @Post() create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: TabletAccountDto,
  ) {
    return this.tablets.saveAccount(body);
  }
  @Patch(':id') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: TabletAccountDto,
  ) {
    return this.tablets.saveAccount(body, id);
  }
  @Get('employees') employees() {
    return this.tablets.employees();
  }
  @Patch('employees/:id/pin') pin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: EmployeePinDto,
  ) {
    return this.tablets.setPin(id, body.pin ?? null);
  }
  @Post('identify')
  @Roles(Role.WAREHOUSE_TABLET)
  identify(
    @Req() request: { user: { sub: string } },
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: VerifyTabletPinDto,
  ) {
    return this.tablets.verifyPin(request.user.sub, body.pin, body.documentId);
  }
}
