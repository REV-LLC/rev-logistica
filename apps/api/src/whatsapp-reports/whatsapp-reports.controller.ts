import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { normalized } from './whatsapp-report.types';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';

class ResolveReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  resolution: string;
}
@Controller('whatsapp-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class WhatsappReportsController {
  constructor(
    private readonly records: WhatsappReportRecordsService,
    private readonly prisma: PrismaService,
  ) {}
  @Get()
  list(
    @Query('kind') kind?: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
  ) {
    return this.records.list(kind, cursor);
  }
  @Get('health')
  async health() {
    const hectors = await this.prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, lastName: true, phone: true },
    });
    return {
      enabled: process.env.WHATSAPP_REPORTS_ENABLED === 'true',
      aiConfigured: Boolean(process.env.WHATSAPP_OPENAI_API_KEY?.trim()),
      actorConfigured: Boolean(
        process.env.WHATSAPP_REPORT_ACTOR_USER_ID?.trim(),
      ),
      metaConfigured: [
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_API_VERSION',
        'META_APP_SECRET',
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      ].every((k) => Boolean(process.env[k]?.trim())),
      hectorFound: hectors.some((e) => {
        const names = normalized(`${e.name} ${e.lastName}`).split(' ');
        return names.includes('hector') && names.includes('ramirez');
      }),
    };
  }
  @Get('attendance')
  attendance() {
    return this.prisma.worksiteAttendance.findMany({
      orderBy: { enteredAt: 'desc' },
      take: 100,
      include: {
        employee: { select: { name: true, lastName: true } },
        customerWorksite: { include: { worksite: { select: { name: true } } } },
      },
    });
  }
  @Get('inbox')
  inbox() {
    return this.prisma.whatsappInboundMessage.findMany({
      where: {
        OR: [
          { status: { in: ['FAILED', 'REJECTED'] } },
          { replyAttempts: { gte: 5 }, replySentAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        employeeId: true,
        phone: true,
        type: true,
        text: true,
        status: true,
        error: true,
        createdAt: true,
        replyAttempts: true,
      },
    });
  }
  @Patch(':id/resolve')
  resolve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: ResolveReportDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.records.resolveReport(id, req.user.sub, input.resolution);
  }
}
