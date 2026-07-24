import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { UploadedBusinessFile } from '../files/files.service';
import { CreateMobilityGuideDto } from './dto/create-mobility-guide.dto';
import { MobilityGuidesService } from './mobility-guides.service';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
type JwtPayload = { sub: string; role: Role };

@Controller('mobility-guides')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
export class MobilityGuidesController {
  constructor(private readonly service: MobilityGuidesService) {}

  @Get('assets')
  listAssets(@Query('search') search?: string) {
    return this.service.listRegisteredAssets(search);
  }

  @Get('assets/:assetId')
  listByAsset(@Param('assetId', new ParseUUIDPipe()) assetId: string) {
    return this.service.listByAsset(assetId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  create(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: CreateMobilityGuideDto,
    @UploadedFile() file: UploadedBusinessFile | undefined,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.service.create(body, file, {
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Delete(':guideId')
  @Roles(Role.ADMIN, Role.OFFICE)
  remove(
    @Param('guideId', new ParseUUIDPipe()) guideId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.service.remove(guideId, {
      id: request.user.sub,
      role: request.user.role,
    });
  }
}
