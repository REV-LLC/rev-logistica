import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AttendanceService } from './attendance.service';
import {
  TestSetupDto,
  ApproveReferenceDto,
  PunchDto,
  ReviewDto,
  SiteLocationDto,
} from './attendance.dto';
type RequestActor = { user: { sub: string; role: Role } };
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR, Role.EMPLOYEE)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}
  @Header('Cache-Control', 'private, no-store')
  @Get('me')
  me(@Req() r: RequestActor) {
    return this.service.me(r.user);
  }
  @Post('test-setup')
  @UseInterceptors(FileInterceptor('selfie', {
    storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4 },
  }))
  testSetup(@Req() r: RequestActor, @Body() dto: TestSetupDto, @UploadedFile() file?: { buffer: Buffer }) {
    return this.service.testSetup(r.user, dto, file?.buffer);
  }
  @Post('punches')
  @UseInterceptors(
    FileInterceptor('selfie', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
    }),
  )
  punch(
    @Req() r: RequestActor,
    @Body() dto: PunchDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.service.punch(r.user, dto, file?.buffer);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('references')
  @Roles(Role.ADMIN, Role.OFFICE)
  references(@Req() r: RequestActor) {
    return this.service.references(r.user);
  }
  @Post('references/:id/analyze')
  @Roles(Role.ADMIN, Role.OFFICE)
  analyze(@Req() r: RequestActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.analyze(r.user, id);
  }
  @Post('references/:id/approve')
  @Roles(Role.ADMIN, Role.OFFICE)
  approve(
    @Req() r: RequestActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveReferenceDto,
  ) {
    return this.service.approveReference(r.user, id, dto.photoHash);
  }
  @Delete('references/:id')
  @Roles(Role.ADMIN, Role.OFFICE)
  revoke(@Req() r: RequestActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revokeReference(r.user, id);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('punches')
  @Roles(Role.ADMIN, Role.OFFICE)
  list(
    @Req() r: RequestActor,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(r.user, cursor, status);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('shifts')
  @Roles(Role.ADMIN, Role.OFFICE)
  shifts(@Req() r: RequestActor) {
    return this.service.shifts(r.user);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('punches/:id/selfie')
  async evidence(
    @Req() r: RequestActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const image = await this.service.evidence(r.user, id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.type('image/jpeg').send(image);
  }
  @Patch('punches/:id/review')
  @Roles(Role.ADMIN, Role.OFFICE)
  review(
    @Req() r: RequestActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.service.review(r.user, id, dto);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get('sites')
  @Roles(Role.ADMIN, Role.OFFICE)
  sites(@Req() r: RequestActor) {
    return this.service.sites(r.user);
  }
  @Patch('sites/:id')
  @Roles(Role.ADMIN, Role.OFFICE)
  updateSite(
    @Req() r: RequestActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SiteLocationDto,
  ) {
    return this.service.updateSite(r.user, id, dto);
  }
}
