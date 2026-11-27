import { Test } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { WhatsappAudioController } from './whatsapp-audio.controller';
import { WhatsappCloudService } from './whatsapp-cloud.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
describe('Private WhatsApp audio', () => {
  let app: INestApplication;
  const findFirst = jest.fn();
  const audio = jest.fn();
  const path =
    '/whatsapp-reports/messages/11111111-2222-4333-8444-555555555555/audio';
  const original = process.env.WHATSAPP_PHONE_NUMBER_ID;
  beforeAll(async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'qa-number';
    const m = await Test.createTestingModule({
      controllers: [WhatsappAudioController],
      providers: [
        {
          provide: PrismaService,
          useValue: { whatsappInboundMessage: { findFirst } },
        },
        { provide: WhatsappCloudService, useValue: { audio } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: any) {
          const req = ctx.switchToHttp().getRequest();
          if (!req.headers['x-role']) throw new UnauthorizedException();
          req.user = { role: req.headers['x-role'] };
          return true;
        },
      })
      .compile();
    app = m.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue({ mediaId: '123' });
    audio
      .mockReset()
      .mockResolvedValue({
        buffer: Buffer.from('ID3 test audio'),
        mimetype: 'audio/mpeg',
        filename: 'nota-de-voz.mp3',
      });
  });
  afterAll(async () => {
    await app.close();
    if (original === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = original;
  });
  it.each(['ADMIN', 'OFFICE'])('streams private audio for %s', async (role) => {
    const r = await request(app.getHttpServer())
      .get(path)
      .set('x-role', role)
      .expect(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-type']).toContain('audio/mpeg');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: '11111111-2222-4333-8444-555555555555',
        type: 'audio',
        phoneNumberId: 'qa-number',
      },
      select: { mediaId: true },
    });
    expect(audio).toHaveBeenCalledWith('123');
  });
  it.each(['DRIVER', 'OPERATOR', 'EMPLOYEE', 'WAREHOUSE_TABLET'])(
    'denies %s before loading media',
    async (role) => {
      await request(app.getHttpServer())
        .get(path)
        .set('x-role', role)
        .expect(403);
      expect(findFirst).not.toHaveBeenCalled();
      expect(audio).not.toHaveBeenCalled();
    },
  );
  it('requires login', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(audio).not.toHaveBeenCalled();
  });
  it.each([null, { mediaId: null }])(
    'reports missing audio without contacting Meta',
    async (row) => {
      findFirst.mockResolvedValue(row);
      await request(app.getHttpServer())
        .get(path)
        .set('x-role', 'OFFICE')
        .expect(404);
      expect(audio).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid ids', async () => {
    await request(app.getHttpServer())
      .get('/whatsapp-reports/messages/invalid/audio')
      .set('x-role', 'OFFICE')
      .expect(400);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
