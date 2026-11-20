import { PrismaService } from '../prisma/prisma.service';
import { WhatsappCustomerService } from './whatsapp-customer.service';
import { emptyCustomerDraft } from './whatsapp-customer-ai.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import { WhatsappWebhookController } from '../notifications/whatsapp-webhook.controller';
import { WhatsappWebhookService } from '../notifications/whatsapp-webhook.service';
import { createHmac, randomUUID } from 'node:crypto';
const url = process.env.WHATSAPP_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    !/^\/whatsapp_qa_[a-z0-9_]+$/.test(u.pathname)
  )
    throw Error('Isolated local test database required');
}
(url ? describe : describe.skip)(
  'Customer WhatsApp intake with PostgreSQL',
  () => {
    const prisma = new PrismaService({
      datasources: {
        db: {
          url: url ?? 'postgresql://unused@localhost:1/whatsapp_qa_unused',
        },
      },
    });
    const ai = { extract: jest.fn() },
      cloud = { reply: jest.fn().mockResolvedValue(undefined) };
    const customers = new WhatsappCustomerService(prisma, ai as any);
    const inbox = new WhatsappInboxService(
      prisma,
      cloud as any,
      {} as any,
      {} as any,
      {} as any,
      customers,
    );
    const webhook = new WhatsappWebhookController(
      new WhatsappWebhookService(prisma, inbox),
    );
    const original = { ...process.env };
    let phone: string;
    const complete = {
      ...emptyCustomerDraft(),
      items: [
        { equipment: 'rana compactadora', quantity: 2 },
        { equipment: 'cortadora', quantity: 1 },
      ],
      customer: 'Constructora prueba',
      worksite: 'obra prueba',
      start: 'mañana 8 am',
      duration: '3 días',
      transport: 'Entrega en obra',
    };
    async function receive(text: string, p = phone, type = 'text') {
      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: 'qa-number' },
                  messages: [
                    {
                      id: 'qa-' + randomUUID(),
                      from: p,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type,
                      text: { body: text },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(body)),
        signature =
          'sha256=' +
          createHmac('sha256', 'qa-secret').update(rawBody).digest('hex');
      await webhook.receive({ rawBody } as any, signature, body);
      await inbox.tick();
      return prisma.whatsappInboundMessage.findUniqueOrThrow({
        where: {
          providerMessageId: body.entry[0].changes[0].value.messages[0].id,
        },
      });
    }
    beforeAll(async () => {
      await prisma.$connect();
      process.env.WHATSAPP_REPORTS_ENABLED = 'true';
      process.env.WHATSAPP_CUSTOMERS_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'qa-number';
      process.env.META_APP_SECRET = 'qa-secret';
    });
    beforeEach(() => {
      phone = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
      ai.extract.mockReset();
      cloud.reply.mockClear();
    });
    afterAll(async () => {
      await prisma.$disconnect();
      process.env = original;
    });
    it('keeps unknown contacts for review, asks missing data and requires a sent summary before creating a request', async () => {
      ai.extract.mockResolvedValueOnce({
        ...emptyCustomerDraft(),
        items: [{ equipment: 'rana', quantity: null }],
      });
      const first = await receive('necesito una rana');
      expect(first.status).toBe('CUSTOMER_PROCESSED');
      expect(first.replyText).toContain('Cuántas');
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(0);
      ai.extract.mockResolvedValueOnce(complete);
      const summary = await receive('son 2, y una cortadora para mañana');
      expect(summary.replyText).toContain('2 × rana compactadora');
      await receive('sí');
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(1);
      ai.extract.mockResolvedValueOnce(emptyCustomerDraft());
      await receive('sí');
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(1);
      const detail = await customers.detail(phone);
      expect(detail.requests[0].details).toMatchObject(complete);
      expect(detail.messages.length).toBe(4);
    });
    it('does not confirm an unsent summary or replay duplicate webhook IDs', async () => {
      ai.extract.mockResolvedValue(complete);
      cloud.reply.mockRejectedValueOnce(Error('offline'));
      const summary = await receive('pedido completo');
      expect(summary.replySentAt).toBeNull();
      await receive('si');
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(0);
      const msg = {
        id: summary.providerMessageId,
        from: phone,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'pedido completo' },
      };
      expect(await inbox.enqueue([msg], 'qa-number')).toBe(0);
      await receive('si');
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(1);
    });
    it('serializes concurrent workers and keeps a single immutable request per confirmation', async () => {
      ai.extract.mockResolvedValue(complete);
      await receive('pedido');
      const queued = await prisma.whatsappInboundMessage.create({
        data: {
          phone,
          phoneNumberId: 'qa-number',
          providerMessageId: 'qa-' + randomUUID(),
          type: 'text',
          text: 'si',
          sentAt: new Date(),
        },
      });
      await Promise.all([customers.process(queued), customers.process(queued)]);
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(1);
    });
    it('pauses for human review, receives further messages and never silently resumes', async () => {
      const first = await receive('asesor');
      expect(first.replyText).toContain('pausa');
      const next = await receive('necesito 2 equipos');
      expect(next.replyText).toBeNull();
      expect(ai.extract).not.toHaveBeenCalled();
      expect(await customers.canReply(phone)).toBe(false);
      await customers.review(
        phone,
        { notes: 'Llamar al cliente', paused: false },
        'qa-office',
      );
      expect(await customers.canReply(phone)).toBe(true);
    });
    it('returns new messages to pending review without discarding notes', async () => {
      await receive('asesor');
      let detail = await customers.detail(phone);
      await customers.review(
        phone,
        {
          notes: 'Revisado por Samuel',
          paused: true,
          reviewedThrough: detail.latest!.toISOString(),
        },
        'qa-admin',
      );
      expect((await customers.list(phone, 'reviewed')).chats).toHaveLength(1);
      await receive('otra cosa');
      expect((await customers.list(phone, 'pending')).chats).toHaveLength(1);
      detail = await customers.detail(phone);
      expect(detail.notes).toBe('Revisado por Samuel');
      expect(detail.messages).toHaveLength(2);
    });
    it('preserves the draft on AI failure and hands off without creating a rental or requesting payment', async () => {
      ai.extract.mockRejectedValue(Error('quota'));
      const msg = await receive('necesito una retro');
      expect(msg.replyText).toContain('revisión de oficina');
      expect((await customers.detail(phone)).paused).toBe(true);
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(0);
    });
    it('excludes active, inactive and ambiguous employee numbers from customer chats', async () => {
      await prisma.employee.create({
        data: {
          name: 'qa employee',
          phone,
          active: false,
          role: 'HEAVY_MACHINERY_OPERATOR',
        },
      });
      expect(await customers.process({ phone } as any)).toBe(false);
      await expect(customers.detail(phone)).rejects.toThrow(
        'Conversación no encontrada',
      );
      expect((await customers.list(phone)).chats).toHaveLength(0);
    });
    it('matches existing customer contacts without assigning or exposing their data to the bot', async () => {
      await prisma.customer.create({
        data: {
          name: 'Cliente QA comercial',
          contactDirectory: [
            { type: 'COMMERCIAL', label: 'Compras', phone: '+' + phone },
          ],
        },
      });
      ai.extract.mockResolvedValue(emptyCustomerDraft());
      await receive('Hola');
      expect(
        (await customers.list('QA comercial')).chats.some(
          (c) =>
            c.phone === phone && c.customers.includes('Cliente QA comercial'),
        ),
      ).toBe(true);
      expect(ai.extract.mock.calls[0][1].customer).toBeNull();
    });
    it('keeps historical rejected messages visible and refuses invalid filters and cursor ownership', async () => {
      const old = await prisma.whatsappInboundMessage.create({
        data: {
          phone,
          phoneNumberId: 'qa-number',
          providerMessageId: 'old-' + randomUUID(),
          type: 'text',
          text: 'necesito equipo',
          sentAt: new Date(),
          status: 'REJECTED',
          error: 'UNKNOWN_OR_AMBIGUOUS_EMPLOYEE',
        },
      });
      expect((await customers.list(phone)).chats).toHaveLength(1);
      await expect(customers.list('', 'invalid')).rejects.toThrow();
      await expect(customers.detail('573000000000', old.id)).rejects.toThrow();
    });
    it('suppresses unsent customer replies when disabled, without blocking the shared outbox', async () => {
      ai.extract.mockResolvedValue(complete);
      cloud.reply.mockRejectedValueOnce(Error('offline'));
      const message = await receive('pedido');
      await prisma.whatsappInboundMessage.update({
        where: { id: message.id },
        data: { nextAttemptAt: new Date(0) },
      });
      process.env.WHATSAPP_CUSTOMERS_ENABLED = 'false';
      try {
        await inbox.tick();
        expect(
          (
            await prisma.whatsappInboundMessage.findUniqueOrThrow({
              where: { id: message.id },
            })
          ).replyText,
        ).toBeNull();
        expect(await customers.canReply(phone)).toBe(false);
      } finally {
        process.env.WHATSAPP_CUSTOMERS_ENABLED = 'true';
      }
    });
    it('rejects signatures and a different business number before customer intake', async () => {
      expect(() =>
        webhook.receive(
          { rawBody: Buffer.from('{}') } as any,
          'sha256=bad',
          {},
        ),
      ).toThrow();
      expect(
        await inbox.enqueue(
          [
            {
              id: 'foreign',
              from: phone,
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: 'text',
              text: { body: 'hola' },
            },
          ],
          'foreign',
        ),
      ).toBe(0);
    });
    it('does not revive a stale draft on a new yes', async () => {
      await prisma.whatsappCustomerChat.create({
        data: {
          phone,
          draft: complete,
          awaitingConfirmation: true,
          lastCustomerAt: new Date(Date.now() - 3 * 86400000),
          leaseUntil: new Date(0),
        },
      });
      ai.extract.mockResolvedValue(emptyCustomerDraft());
      await receive('si');
      expect(ai.extract.mock.calls[0][1]).toEqual(emptyCustomerDraft());
      expect(
        await prisma.whatsappCustomerRequest.count({ where: { phone } }),
      ).toBe(0);
    });
  },
);
