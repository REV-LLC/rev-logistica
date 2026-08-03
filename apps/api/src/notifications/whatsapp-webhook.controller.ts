import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

@Controller('webhooks/whatsapp')
@SkipThrottle()
export class WhatsappWebhookController {
  constructor(private readonly webhook: WhatsappWebhookService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ) {
    const configured = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
    if (!configured)
      throw new ServiceUnavailableException(
        'WhatsApp webhook is not configured',
      );
    if (
      mode !== 'subscribe' ||
      !token ||
      !challenge ||
      !this.equal(token, configured)
    ) {
      throw new UnauthorizedException('Invalid WhatsApp webhook verification');
    }
    return response.status(200).type('text/plain').send(challenge);
  }

  @Post()
  @HttpCode(200)
  receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: unknown,
  ) {
    this.verifySignature(request.rawBody, signature);
    return this.webhook.process(
      payload as Parameters<WhatsappWebhookService['process']>[0],
    );
  }

  private verifySignature(rawBody?: Buffer, signature?: string) {
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appSecret)
      throw new ServiceUnavailableException(
        'Meta app secret is not configured',
      );
    if (!rawBody || !signature?.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing WhatsApp webhook signature');
    }
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    if (!this.equal(signature, expected)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }
  }

  private equal(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
