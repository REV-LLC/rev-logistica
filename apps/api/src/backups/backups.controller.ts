import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackupsService } from './backups.service';

@Controller('backups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('tables')
  listTables() {
    return this.backupsService.listTables();
  }

  @Get('export/json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportJson(@Res({ passthrough: true }) response: Response) {
    const backup = await this.backupsService.createJsonBackup();
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.metadata.fileName}"`,
    );
    return backup;
  }

  @Get('export/csv/:table')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Param('table') table: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csv = await this.backupsService.createCsvExport(table);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return csv;
  }

  @Post('import/json')
  importJson(@Body() body: unknown) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Backup JSON requerido');
    }
    return this.backupsService.importJsonBackup(body);
  }
}
