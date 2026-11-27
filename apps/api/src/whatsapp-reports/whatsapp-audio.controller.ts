import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
@Controller('whatsapp-reports/messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class WhatsappAudioController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloud: WhatsappCloudService,
  ) {}
  @Get(':id/audio')
  async audio(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const message = await this.prisma.whatsappInboundMessage.findFirst({
      where: {
        id,
        type: 'audio',
        phoneNumberId:
          process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || 'not-configured',
      },
      select: { mediaId: true },
    });
    if (!message?.mediaId)
      throw new NotFoundException(
        'Este audio no quedó disponible. Solicita que lo reenvíen.',
      );
    const audio = await this.cloud.audio(message.mediaId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${audio.filename}"`,
    );
    res.type(audio.mimetype).send(audio.buffer);
  }
}
