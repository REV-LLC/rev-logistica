import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  AnnexSharingService,
  type AnnexPdfUpload,
} from './annex-sharing.service';
import { assertDailyAnnex } from './annex-daily-scope';
import { selectAnnexMode } from './annex-mode-selection';
import { AnnexSourceService } from './annex-source.service';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { calculateAnnex } from './annex-engine';
import { AnnexesService } from './annexes.service';
@Controller('annexes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class AnnexesController {
  constructor(
    private readonly annexes: AnnexesService,
    private readonly source: AnnexSourceService,
    private readonly sharing: AnnexSharingService,
  ) {}
  @Get('library')
  @Header('Cache-Control', 'no-store')
  library(
    @Query('customerId') customerId?: string,
    @Query('customerWorksiteId') customerWorksiteId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.annexes.library({ customerId, customerWorksiteId, cursor });
  }
  @Get('worksites/:id/recipients')
  @Header('Cache-Control', 'no-store')
  recipients(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sharing.recipients(id);
  }
  @Post('worksites/:id/send')
  @UseInterceptors(
    FileInterceptor('pdf', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 6 },
    }),
  )
  send(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @UploadedFile() pdf: AnnexPdfUpload | undefined,
    @Req() req: { user: { sub: string } },
  ) {
    return this.sharing.send(id, body, pdf, req.user.sub);
  }
  @Get('charge-options')
  @Header('Cache-Control', 'no-store')
  chargeOptions(@Query('customerWorksiteId', new ParseUUIDPipe()) id: string) {
    return this.source.chargeOptions(id);
  }
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(
    @Query('customerWorksiteId') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('through') through: string,
  ) {
    return this.source.prepare(id, from, to, through, true);
  }
  @Get('prepare') prepare(
    @Query('customerWorksiteId') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('through') through: string,
  ) {
    return this.source.prepare(id, from, to, through);
  }
  @Post('select-mode') selectMode(@Body() body: unknown) {
    return assertDailyAnnex(selectAnnexMode(body));
  }
  @Post('preview') preview(@Body() body: unknown) {
    return calculateAnnex(assertDailyAnnex(body));
  }
  @Get('drafts') list(@Query('customerWorksiteId') id: string) {
    return this.annexes.list(id);
  }
  @Get('drafts/:id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.annexes.get(id);
  }
  @Post('drafts/:id/invoice')
  assignStoredInvoice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: { user: { sub: string } },
  ) {
    return this.annexes.assignStoredInvoice(id, body, req.user.sub);
  }
  @Get('drafts/:id/history') history(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.annexes.history(id);
  }
  @Post('drafts') save(
    @Body() body: unknown,
    @Req() req: { user: { sub: string } },
  ) {
    return this.annexes.save(body, req.user.sub);
  }
}
