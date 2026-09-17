import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AccessoriesService } from './accessories.service';
import { AccessoryDocumentOptionsDto } from './dto/accessory-document-options.dto';
import {
  CreateAccessoryDto,
  MoveAccessoryDto,
  UpdateAccessoryDto,
} from './dto/accessory.dto';

const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
type AuthRequest = Request & { user: { sub: string } };
function validPage(page: number) {
  if (page < 0 || page > 100000)
    throw new BadRequestException('Página inválida.');
  return page;
}

@Controller('accessories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class AccessoriesController {
  constructor(private readonly accessories: AccessoriesService) {}

  @Get('document-options')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  documentOptions(@Query(validation) query: AccessoryDocumentOptionsDto) {
    return this.accessories.documentOptions(query);
  }

  @Get('equipment')
  equipment(@Query('familyId', new ParseUUIDPipe()) familyId: string) {
    return this.accessories.equipment(familyId);
  }

  @Get('equipment/:id')
  equipmentById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accessories.equipmentById(id);
  }

  @Get()
  list(
    @Query('assetId', new ParseUUIDPipe({ optional: true }))
    assetId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('familyId', new ParseUUIDPipe({ optional: true }))
    familyId: string | undefined,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
  ) {
    return this.accessories.list(assetId, search, validPage(page), familyId);
  }

  @Post()
  create(@Body(validation) dto: CreateAccessoryDto, @Req() req: AuthRequest) {
    return this.accessories.create(dto, req.user.sub);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accessories.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validation) dto: UpdateAccessoryDto,
    @Req() req: AuthRequest,
  ) {
    return this.accessories.update(id, dto, req.user.sub);
  }

  @Get(':id/history')
  history(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
  ) {
    return this.accessories.history(id, validPage(page));
  }

  @Post(':id/movements')
  move(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validation) dto: MoveAccessoryDto,
    @Req() req: AuthRequest,
  ) {
    return this.accessories.move(id, dto, req.user.sub);
  }
}
