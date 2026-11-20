import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { Response } from 'express';
import sharp from 'sharp';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WhatsappCustomerService } from './whatsapp-customer.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
class ReviewChatDto {
  @IsString() @MaxLength(4000) notes: string;
  @IsBoolean() paused: boolean;
  @IsOptional() @IsDateString() reviewedThrough?: string;
}
@Controller('whatsapp-customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class WhatsappCustomerController {
  constructor(
    private readonly customers: WhatsappCustomerService,
    private readonly cloud: WhatsappCloudService,
    private readonly prisma: PrismaService,
  ) {}
  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.customers.list(
      search?.slice(0, 100),
      status,
      page ? Number(page) : 0,
    );
  }
  @Get(':phone')
  detail(
    @Param('phone') phone: string,
    @Query('before', new ParseUUIDPipe({ optional: true })) before?: string,
  ) {
    return this.customers.detail(phone, before);
  }
  @Patch(':phone')
  review(
    @Param('phone') phone: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: ReviewChatDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.customers.review(phone, body, req.user.sub);
  }
  @Get(':phone/messages/:id/photo')
  async photo(
    @Param('phone') phone: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    await this.customers.assertCustomerPhone(phone);
    const message = await this.prisma.whatsappInboundMessage.findFirst({
      where: { id, phone, employeeId: null, type: 'image' },
    });
    if (!message?.mediaId) throw new NotFoundException('Foto no disponible');
    const file = await this.cloud.photo(message.mediaId);
    const buffer = await sharp(file.buffer)
      .resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('image/jpeg').send(buffer);
  }
}
