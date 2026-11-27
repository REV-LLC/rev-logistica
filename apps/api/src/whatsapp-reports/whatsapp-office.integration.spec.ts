import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappCustomerService } from './whatsapp-customer.service';
import { emptyCustomerDraft } from './whatsapp-customer-ai.service';
import { WhatsappOfficeService } from './whatsapp-office.service';
import { WhatsappWebhookService } from '../notifications/whatsapp-webhook.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
const url = process.env.WHATSAPP_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    !/^\/whatsapp_qa_[a-z0-9_]+$/.test(u.pathname)
  )
    throw Error('Isolated local database required');
}
(url ? describe : describe.skip)(
  'Office WhatsApp replies with PostgreSQL',
  () => {
    const prisma = new PrismaService({
      datasources: {
        db: {
          url: url ?? 'postgresql://unused@localhost:1/whatsapp_qa_unused',
        },
      },
    });
    const cloud = { sendOfficeText: jest.fn(), reply: jest.fn() },
      customers = new WhatsappCustomerService(prisma, {} as any),
      office = new WhatsappOfficeService(prisma, customers, cloud as any);
    const original = { ...process.env };
    let phone: string, userId: string;
    beforeAll(async () => {
      await prisma.$connect();
      process.env.WHATSAPP_REPORTS_ENABLED = 'true';
      process.env.WHATSAPP_CUSTOMERS_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'qa-office';
      process.env.WHATSAPP_ACCESS_TOKEN = 'mock-token';
      process.env.WHATSAPP_API_VERSION = 'v25.0';
      userId = (
        await prisma.user.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            passwordHash: 'test-only',
            role: 'OFFICE',
          },
        })
      ).id;
    });
    afterAll(async () => {
      await prisma.$disconnect();
      process.env = original;
    });
    beforeEach(async () => {
      cloud.sendOfficeText
        .mockReset()
        .mockResolvedValue(`wamid.${randomUUID()}`);
      cloud.reply.mockReset().mockResolvedValue(undefined);
      phone = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
      await prisma.whatsappCustomerChat.create({
        data: {
          phone,
          draft: emptyCustomerDraft(),
          leaseUntil: new Date(0),
          awaitingConfirmation: true,
          confirmationMessageId: randomUUID(),
        },
      });
      await prisma.whatsappInboundMessage.create({
        data: {
          providerMessageId: randomUUID(),
          phone,
          phoneNumberId: 'qa-office',
          type: 'text',
          text: 'Necesito un equipo',
          status: 'CUSTOMER_PROCESSED',
          replyKind: 'CUSTOMER_TEXT',
          replyText: 'Resumen anterior',
          sentAt: new Date(),
        },
      });
    });
    it('persists author and text, pauses the bot and suppresses its pending summary before sending', async () => {
      const before = await prisma.whatsappCustomerRequest.count({
          where: { phone },
        }),
        id = randomUUID();
      const result = await office.send(
        phone,
        '  Respuesta de oficina  ',
        id,
        userId,
      );
      expect(result.status).toBe('SENT');
      expect(result.actorName).toBe('Oficina');
      expect(cloud.sendOfficeText).toHaveBeenCalledWith(
        phone,
        'Respuesta de oficina',
      );
      expect(result).not.toHaveProperty('providerMessageId');
      const chat = await prisma.whatsappCustomerChat.findUniqueOrThrow({
        where: { phone },
      });
      expect(chat.paused).toBe(true);
      expect(chat.awaitingConfirmation).toBe(false);
      expect(chat.confirmationMessageId).toBeNull();
      expect(chat.leaseToken).toBeNull();
      expect(
        (
          await prisma.whatsappInboundMessage.findFirstOrThrow({
            where: { phone },
          })
        ).replyText,
      ).toBeNull();
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(before);
      expect(
        (
          await prisma.whatsappOfficeMessage.findUniqueOrThrow({
            where: { id },
          })
        ).actorUserId,
      ).toBe(userId);
      await office.send(phone, 'Respuesta de oficina', id, userId);
      expect(cloud.sendOfficeText).toHaveBeenCalledTimes(1);
      await expect(
        office.send(phone, 'Otro texto', id, userId),
      ).rejects.toThrow('otro mensaje');
    });
    it('serializes concurrent sends and accepts an idempotent retry without sending twice', async () => {
      const id = randomUUID();
      const results = await Promise.allSettled([
        office.send(phone, 'Respuesta', id, userId),
        office.send(phone, 'Respuesta', id, userId),
      ]);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      await office.send(phone, 'Respuesta', id, userId);
      expect(cloud.sendOfficeText).toHaveBeenCalledTimes(1);
      expect(
        await prisma.whatsappOfficeMessage.count({ where: { phone } }),
      ).toBe(1);
    });
    it('does not send after 24 hours or when the channel is disabled', async () => {
      await prisma.whatsappInboundMessage.updateMany({
        where: { phone },
        data: { sentAt: new Date(Date.now() - 25 * 3600000) },
      });
      await expect(
        office.send(phone, 'Respuesta', randomUUID(), userId),
      ).rejects.toThrow('24 horas');
      expect(
        await prisma.whatsappOfficeMessage.count({ where: { phone } }),
      ).toBe(0);
      expect(cloud.sendOfficeText).not.toHaveBeenCalled();
      process.env.WHATSAPP_CUSTOMERS_ENABLED = 'false';
      try {
        await expect(
          office.send(phone, 'Respuesta', randomUUID(), userId),
        ).rejects.toThrow('desactivado');
      } finally {
        process.env.WHATSAPP_CUSTOMERS_ENABLED = 'true';
      }
    });
    it.each([
      ['FAILED', true],
      ['UNCERTAIN', false],
    ])(
      'records %s and never retries an ambiguous or rejected send automatically',
      async (status, rejected) => {
        cloud.sendOfficeText.mockRejectedValueOnce(
          Object.assign(new Error('simulated send failure'), { rejected }),
        );
        const id = randomUUID();
        expect((await office.send(phone, 'Respuesta', id, userId)).status).toBe(
          status,
        );
        expect((await office.send(phone, 'Respuesta', id, userId)).status).toBe(
          status,
        );
        expect(cloud.sendOfficeText).toHaveBeenCalledTimes(1);
        expect(
          (
            await prisma.whatsappCustomerChat.findUniqueOrThrow({
              where: { phone },
            })
          ).paused,
        ).toBe(true);
      },
    );
    it('blocks manual replies while the bot holds the same chat lease', async () => {
      await prisma.whatsappCustomerChat.update({
        where: { phone },
        data: {
          leaseToken: randomUUID(),
          leaseUntil: new Date(Date.now() + 60000),
        },
      });
      await expect(
        office.send(phone, 'Respuesta', randomUUID(), userId),
      ).rejects.toThrow('mensaje en proceso');
      expect(cloud.sendOfficeText).not.toHaveBeenCalled();
    });
    it('takes the chat lease while a bot reply is being sent', async () => {
      // Isolate this reply from other test conversations in the shared local database.
      await prisma.whatsappInboundMessage.updateMany({
        where: { phone: { not: phone }, replySentAt: null },
        data: { replyText: null },
      });
      let started!: () => void, finish!: () => void;
      const began = new Promise<void>((r) => (started = r)),
        hold = new Promise<void>((r) => (finish = r));
      cloud.reply.mockImplementationOnce(async () => {
        started();
        await hold;
      });
      const inbox = new WhatsappInboxService(
        prisma,
        cloud as any,
        {} as any,
        {} as any,
        {} as any,
        customers,
      );
      const sending = (inbox as any).sendReplies();
      await began;
      try {
        await expect(
          office.send(phone, 'Respuesta humana', randomUUID(), userId),
        ).rejects.toThrow('mensaje en proceso');
        expect(cloud.sendOfficeText).not.toHaveBeenCalled();
      } finally {
        finish();
        await sending;
      }
      expect(
        (
          await prisma.whatsappCustomerChat.findUniqueOrThrow({
            where: { phone },
          })
        ).leaseToken,
      ).toBeNull();
    });
    it('keeps delivery receipts monotonic and paginates office history', async () => {
      const id = randomUUID();
      await office.send(phone, 'Respuesta', id, userId);
      const row = await prisma.whatsappOfficeMessage.findUniqueOrThrow({
        where: { id },
      });
      const webhook = new WhatsappWebhookService(prisma);
      const payload = (status: string) => ({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: row.providerMessageId!,
                      status,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      await webhook.process(payload('read'));
      await webhook.process(payload('sent'));
      expect(
        (
          await prisma.whatsappOfficeMessage.findUniqueOrThrow({
            where: { id },
          })
        ).status,
      ).toBe('READ');
      await prisma.whatsappOfficeMessage.createMany({
        data: Array.from({ length: 55 }, (_, i) => ({
          id: randomUUID(),
          phone,
          phoneNumberId: 'qa-office',
          actorUserId: userId,
          actorName: 'Oficina',
          text: `Respuesta ${i}`,
          status: 'SENT',
        })),
      });
      const first = await office.list(phone);
      expect(first.messages).toHaveLength(50);
      expect(first.before).toBeTruthy();
      const second = await office.list(phone, first.before!);
      expect(second.messages).toHaveLength(6);
      expect(
        new Set([...first.messages, ...second.messages].map((m) => m.id)).size,
      ).toBe(56);
    });
  },
);
