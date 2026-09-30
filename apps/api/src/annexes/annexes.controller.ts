import { AnnexSourceService } from './annex-source.service';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
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
  ) {}
  @Get('prepare') prepare(
    @Query('customerWorksiteId') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('through') through: string,
  ) {
    return this.source.prepare(id, from, to, through);
  }
  @Post('preview') preview(@Body() body: unknown) {
    return calculateAnnex(body);
  }
  @Get('drafts') list(@Query('customerWorksiteId') id: string) {
    return this.annexes.list(id);
  }
  @Get('drafts/:id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.annexes.get(id);
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
