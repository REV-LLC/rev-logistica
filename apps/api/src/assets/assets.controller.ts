import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssignAssetMotorDto } from './dto/assign-asset-motor.dto';
import { AssetsService } from './assets.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  listAssets(
    @Query('serial') serial?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const parsedTake = take ? Number(take) : undefined;
    const parsedSkip = skip ? Number(skip) : undefined;

    if (take && Number.isNaN(parsedTake)) {
      throw new BadRequestException('Invalid take');
    }

    if (skip && Number.isNaN(parsedSkip)) {
      throw new BadRequestException('Invalid skip');
    }

    return this.assetsService.listAssets({
      serial,
      search,
      take: parsedTake,
      skip: parsedSkip,
    });
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE)
  createAsset(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateAssetDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.assetsService.createAsset(payload, request.user.sub);
  }

  @Patch(':assetId')
  @Roles(Role.ADMIN, Role.OFFICE)
  updateAsset(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateAssetDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.assetsService.updateAsset(assetId, payload, request.user.sub);
  }

  @Patch(':assetId/assigned-motor')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  assignMotor(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: AssignAssetMotorDto,
  ) {
    return this.assetsService.assignMotor(assetId, payload.motorId);
  }

  @Get(':assetId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  getAssetById(@Param('assetId', new ParseUUIDPipe()) assetId: string) {
    return this.assetsService.getAssetById(assetId);
  }

  @Get(':assetId/location')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  getAssetLocation(@Param('assetId', new ParseUUIDPipe()) assetId: string) {
    return this.assetsService.getAssetLocation(assetId);
  }

  @Delete(':assetId')
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteAsset(@Param('assetId', new ParseUUIDPipe()) assetId: string) {
    return this.assetsService.deleteAsset(assetId);
  }
}
