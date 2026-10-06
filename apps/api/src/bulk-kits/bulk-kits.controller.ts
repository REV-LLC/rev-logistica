import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BulkKitsService } from './bulk-kits.service';
import { BulkKitSettingsDto, SaveBulkKitDto } from './bulk-kits.dto';
@Controller('bulk-kits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class BulkKitsController {
  constructor(private readonly service: BulkKitsService) {}
  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  list() {
    return this.service.list();
  }
  @Get('families/:id')
  family(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.family(id);
  }
  @Put('families/:id/settings')
  settings(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: BulkKitSettingsDto,
  ) {
    return this.service.settings(id, dto);
  }
  @Post('families/:id/kits')
  create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: SaveBulkKitDto,
  ) {
    return this.service.save(id, dto);
  }
  @Put('families/:id/kits/:kitId')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('kitId', new ParseUUIDPipe()) kitId: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: SaveBulkKitDto,
  ) {
    return this.service.save(id, dto, kitId);
  }
}
