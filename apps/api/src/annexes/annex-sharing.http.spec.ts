import 'reflect-metadata';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { IdempotencyService } from '../common/idempotency.service';
import { NotificationTransportService } from '../notifications/notification-transport.service';
import { AnnexesController } from './annexes.controller';
import { AnnexesService } from './annexes.service';
import { AnnexSourceService } from './annex-source.service';
import { AnnexSharingService } from './annex-sharing.service';
describe('annex sharing HTTP', () => {
  let app: INestApplication;
  const id = '00000000-0000-4000-8000-000000000001';
  const operationId = '00000000-0000-4000-8000-000000000002';
  const operations = new Map<string, any>();
  const prisma = {
    customerWorksite: {
      findUnique: async () => ({
        alias: 'Obra Norte',
        customer: {
          name: 'Cliente',
          phone: '3001234567',
          email: 'cliente@example.test',
        },
        worksite: {
          name: 'Obra',
          contactName: 'Residente',
          phone: '3011234567',
          email: 'obra@example.test',
        },
      }),
    },
    syncOperation: {
      findUnique: async ({ where }) =>
        operations.get(where.createdBy_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }) =>
        operations.set(data.idempotencyKey, { ...data, status: 'PROCESSING' }),
      update: async ({ where, data }) =>
        Object.assign(
          operations.get(where.createdBy_idempotencyKey.idempotencyKey),
          data,
        ),
      deleteMany: async ({ where }) => operations.delete(where.idempotencyKey),
    },
  };
  const mail = { sendMail: jest.fn(async () => ({ sent: true })) };
  const transport = {
    sendWhatsappPdf: jest.fn(async () => ({
      sent: true,
      providerMessageId: 'wamid-1',
    })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AnnexesController],
      providers: [
        AnnexSharingService,
        IdempotencyService,
        { provide: AnnexesService, useValue: {} },
        { provide: AnnexSourceService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: NotificationTransportService, useValue: transport },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          req.user = {
            sub: 'actor',
            role: req.headers['x-test-role'] ?? Role.ADMIN,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    operations.clear();
  });
  afterAll(async () => app.close());
  const send = (
    role: Role = Role.OFFICE,
    pdf = Buffer.from('%PDF-1.4\nexample'),
  ) =>
    request(app.getHttpServer())
      .post(`/annexes/worksites/${id}/send`)
      .set('x-test-role', role)
      .field('channel', 'WHATSAPP')
      .field('recipient', '3001234567')
      .field('from', '2026-11-01')
      .field('to', '2026-11-15')
      .field('through', '2026-11-03')
      .field('requestId', operationId)
      .attach('pdf', pdf, {
        filename: 'anexo.pdf',
        contentType: 'application/pdf',
      });
  it('accepts a multipart PDF from Office, scopes contacts to the worksite and prevents duplicate retries', async () => {
    const recipients = await request(app.getHttpServer())
      .get(`/annexes/worksites/${id}/recipients`)
      .set('x-test-role', Role.OFFICE)
      .expect(200);
    expect(recipients.body.phones.map((row) => row.value)).toEqual([
      '+573011234567',
      '+573001234567',
    ]);
    const first = await send().expect(201);
    expect(first.body).toMatchObject({ sent: true, status: 'accepted' });
    await send().expect(201);
    expect(transport.sendWhatsappPdf).toHaveBeenCalledTimes(1);
    await send(Role.OFFICE, Buffer.from('%PDF-1.4\ndifferent')).expect(409);
    expect(transport.sendWhatsappPdf).toHaveBeenCalledTimes(1);
  });
  it.each([Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET])(
    'does not let %s read client contacts or send annexes',
    async (role) => {
      await request(app.getHttpServer())
        .get(`/annexes/worksites/${id}/recipients`)
        .set('x-test-role', role)
        .expect(403);
      await send(role).expect(403);
      expect(transport.sendWhatsappPdf).not.toHaveBeenCalled();
    },
  );
  it('rejects missing and disguised attachments through the HTTP upload boundary', async () => {
    await request(app.getHttpServer())
      .post(`/annexes/worksites/${id}/send`)
      .send({})
      .expect(400);
    await send(Role.ADMIN, Buffer.from('Not a pdf')).expect(400);
    expect(transport.sendWhatsappPdf).not.toHaveBeenCalled();
  });
});
