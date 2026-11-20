import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { WhatsappCustomerController } from './whatsapp-customer.controller';
import { WhatsappCustomerService } from './whatsapp-customer.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
describe('Customer chat access', () => {
  let app: INestApplication;
  const service = {
    list: jest.fn().mockResolvedValue({ chats: [] }),
    detail: jest.fn().mockResolvedValue({}),
    review: jest.fn().mockResolvedValue({ ok: true }),
    assertCustomerPhone: jest.fn(),
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      controllers: [WhatsappCustomerController],
      providers: [
        { provide: WhatsappCustomerService, useValue: service },
        { provide: WhatsappCloudService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: any) {
          const req = ctx.switchToHttp().getRequest();
          if (!req.headers['x-role']) throw new UnauthorizedException();
          req.user = { sub: 'qa-reviewer', role: req.headers['x-role'] };
          return true;
        },
      })
      .compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  it.each(['ADMIN', 'OFFICE'])(
    'permits %s to read and review',
    async (role) => {
      await request(app.getHttpServer())
        .get('/whatsapp-customers')
        .set('x-role', role)
        .expect(200);
      await request(app.getHttpServer())
        .patch('/whatsapp-customers/573001234567')
        .set('x-role', role)
        .send({
          notes: 'Llamar',
          paused: true,
          reviewedThrough: '2026-11-20T12:00:00.000Z',
        })
        .expect(200);
      expect(service.review).toHaveBeenCalledWith(
        '573001234567',
        expect.anything(),
        'qa-reviewer',
      );
    },
  );
  it.each(['DRIVER', 'OPERATOR', 'EMPLOYEE', 'WAREHOUSE_TABLET'])(
    'denies %s across list, detail, review and photos',
    async (role) => {
      for (const path of [
        '/whatsapp-customers',
        '/whatsapp-customers/573001234567',
        '/whatsapp-customers/573001234567/messages/11111111-2222-4333-8444-555555555555/photo',
      ])
        await request(app.getHttpServer())
          .get(path)
          .set('x-role', role)
          .expect(403);
      await request(app.getHttpServer())
        .patch('/whatsapp-customers/573001234567')
        .set('x-role', role)
        .send({ notes: '', paused: false })
        .expect(403);
    },
  );
  it('rejects anonymous and malformed reviews', async () => {
    await request(app.getHttpServer()).get('/whatsapp-customers').expect(401);
    for (const body of [
      { notes: '', paused: 'false' },
      { notes: '', paused: false, customerId: 'forged' },
      { notes: '', paused: true, reviewedThrough: 'tomorrow' },
    ])
      await request(app.getHttpServer())
        .patch('/whatsapp-customers/573001234567')
        .set('x-role', 'ADMIN')
        .send(body)
        .expect(400);
  });
});
