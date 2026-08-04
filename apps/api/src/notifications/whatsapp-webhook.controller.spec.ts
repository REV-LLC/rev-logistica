import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

describe('WhatsappWebhookController', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-token',
      META_APP_SECRET: 'app-secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns the Meta verification challenge', () => {
    const service = { process: jest.fn() };
    const controller = new WhatsappWebhookController(service as any);
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnValue('challenge-value'),
    };

    expect(
      controller.verify(
        'subscribe',
        'verify-token',
        'challenge-value',
        response as any,
      ),
    ).toBe('challenge-value');
    expect(response.send).toHaveBeenCalledWith('challenge-value');
  });

  it('validates the payload signature before processing', async () => {
    const payload = { object: 'whatsapp_business_account', entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(rawBody).digest('hex')}`;
    const service = {
      process: jest.fn().mockResolvedValue({ received: true, processed: 0 }),
    };
    const controller = new WhatsappWebhookController(service as any);

    await expect(
      controller.receive({ rawBody } as any, signature, payload),
    ).resolves.toEqual({ received: true, processed: 0 });
    expect(service.process).toHaveBeenCalledWith(payload);
  });

  it('rejects a webhook with an invalid signature', () => {
    const controller = new WhatsappWebhookController({
      process: jest.fn(),
    } as any);
    expect(() =>
      controller.receive(
        { rawBody: Buffer.from('{}') } as any,
        'sha256=invalid',
        {},
      ),
    ).toThrow(UnauthorizedException);
  });
});
