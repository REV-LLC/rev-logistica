import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWebhookController } from '../notifications/whatsapp-webhook.controller';
import { WhatsappWebhookService } from '../notifications/whatsapp-webhook.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';
import { emptyDraft, normalizePhone } from './whatsapp-report.types';
import { WhatsappReportAlertsService } from './whatsapp-report-alerts.service';

const testUrl = process.env.WHATSAPP_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !/^\/whatsapp_qa_[a-z0-9_]+$/.test(parsed.pathname)
  ) {
    throw new Error(
      'WhatsApp integration tests require an isolated local whatsapp_qa_* database',
    );
  }
}
(testUrl ? describe : describe.skip)(
  'WhatsApp employee reports with PostgreSQL',
  () => {
    const prisma = new PrismaService({
      datasources: {
        db: {
          url: testUrl ?? 'postgresql://unused@localhost:1/whatsapp_qa_unused',
        },
      },
    });
    const records = new WhatsappReportRecordsService(prisma);
    const cloud = {
      reply: jest.fn().mockResolvedValue(undefined),
      photo: jest.fn().mockResolvedValue({
        buffer: Buffer.from('test-photo'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        size: 10,
      }),
    };
    const ai = { extract: jest.fn() };
    let employee: any,
      asset: any,
      vehicle: any,
      site: any,
      manager: any,
      hector: any,
      office: any;
    let timestamp = Math.floor(Date.now() / 1000) - 1800;
    const files = {
      storeWhatsappEvidence: jest.fn(async (employeeId: string) => ({
        files: [
          await prisma.fileObject.create({
            data: {
              entityType: 'EMPLOYEE',
              entityId: employeeId,
              fileType: 'EVIDENCIA_WHATSAPP',
              category: 'EVIDENCIA_WHATSAPP',
              storageKey: 'test-only://photo',
              mimeType: 'image/jpeg',
              createdBy: `whatsapp:${employeeId}`,
            },
          }),
        ],
      })),
    };
    const inbox = new WhatsappInboxService(
      prisma,
      cloud as any,
      files as any,
      ai as any,
      records,
    );
    const webhook = new WhatsappWebhookController(
      new WhatsappWebhookService(prisma, inbox),
    );
    const originalEnv = { ...process.env };
    const extracted = (changes: object) => {
      const { evidenceFileIds, sourceMessageIds, occurredAt, ...fields } =
        emptyDraft();
      return { ...fields, ...changes };
    };
    async function send(
      text: string,
      options: {
        image?: boolean;
        from?: string;
        id?: string;
        phoneId?: string;
        selectionId?: string;
        button?: boolean;
      } = {},
    ) {
      const id = options.id ?? `wamid.qa.${randomUUID()}`;
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: options.phoneId ?? 'qa-phone' },
                  messages: [
                    {
                      id,
                      from: options.from ?? '573001234567',
                      timestamp: String(++timestamp),
                      type: options.selectionId
                        ? 'interactive'
                        : options.image
                          ? 'image'
                          : 'text',
                      ...(options.selectionId
                        ? {
                            interactive: {
                              [options.button ? 'button_reply' : 'list_reply']:
                                { id: options.selectionId, title: text },
                            },
                          }
                        : options.image
                          ? { image: { id: '12345', caption: text } }
                          : { text: { body: text } }),
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = `sha256=${createHmac('sha256', 'test-secret').update(rawBody).digest('hex')}`;
      await webhook.receive({ rawBody } as any, signature, payload);
      await inbox.tick();
      return prisma.whatsappInboundMessage.findUnique({
        where: { providerMessageId: id },
      });
    }
    beforeAll(async () => {
      process.env.WHATSAPP_REPORTS_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'qa-phone';
      process.env.META_APP_SECRET = 'test-secret';
      await prisma.$connect();
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "Employee", "Owner", "AssetFamily", "Customer", "Project", "Vehicle", "FileObject", "WhatsappInboundMessage", "WhatsappConversation" CASCADE',
      );
      const actor = await prisma.user.create({
        data: {
          email: `office-${randomUUID()}@example.invalid`,
          role: 'OFFICE',
          passwordHash: 'disabled-test-only',
        },
      });
      process.env.WHATSAPP_REPORT_ACTOR_USER_ID = actor.id;
      office = await prisma.employee.create({
        data: {
          name: 'Oficina QA',
          role: 'OFFICE',
          phone: '3002222222',
          userId: actor.id,
        },
      });
      employee = await prisma.employee.create({
        data: {
          name: 'Operario QA',
          role: 'HEAVY_MACHINERY_OPERATOR',
          phone: '+57 300 123 4567',
        },
      });
      manager = await prisma.employee.create({
        data: { name: 'Gerente QA', role: 'MANAGER', phone: '3003333333' },
      });
      hector = await prisma.employee.create({
        data: {
          name: 'Héctor',
          lastName: 'Ramírez',
          role: 'OTHER',
          phone: '3004444444',
        },
      });
      const owner = await prisma.owner.create({ data: { name: 'REV QA' } });
      const warehouse = await prisma.warehouse.create({
        data: { name: 'QA', type: 'OWN', ownerCompanyId: owner.id },
      });
      const family = await prisma.assetFamily.create({
        data: { name: 'QA', code: randomUUID(), controlType: 'SERIAL' },
      });
      const sku = await prisma.sku.create({
        data: {
          name: 'Retroexcavadora QA',
          assetFamilyId: family.id,
          chargeType: 'HOUR',
        },
      });
      asset = await prisma.asset.create({
        data: {
          skuId: sku.id,
          publicCode: 'QA-RETRO-02',
          internalNumber: 2,
          warehouseOwnerId: warehouse.id,
          hourMeter: 100,
        },
      });
      vehicle = await prisma.vehicle.create({ data: { plate: 'QA1234' } });
      const customer = await prisma.customer.create({
        data: {
          name: 'Cliente QA',
          identityDocumentType: 'NIT',
          nitOrId: randomUUID(),
        },
      });
      const worksite = await prisma.worksite.create({
        data: { name: 'Obra QA única' },
      });
      site = await prisma.customerWorksite.create({
        data: { customerId: customer.id, worksiteId: worksite.id },
      });
    });
    afterAll(async () => {
      process.env = originalEnv;
      await prisma.$disconnect();
    });
    beforeEach(async () => {
      ai.extract.mockReset();
      cloud.reply.mockClear();
      await prisma.whatsappInboundMessage.updateMany({
        data: { createdAt: new Date(Date.now() - 120000) },
      });
    });

    it('sends a named four-option menu for greetings without an AI request', async () => {
      const greeting = await send('Hola');
      expect(greeting?.replyText).toContain('Hola, Operario Qa');
      expect(greeting?.replyKind).toBe('REPORT_MENU');
      expect(greeting?.replySentAt).not.toBeNull();
      expect(cloud.reply).toHaveBeenCalledWith(
        '573001234567',
        greeting!.replyText,
        'REPORT_MENU',
      );
      expect(ai.extract).not.toHaveBeenCalled();
      expect(await prisma.whatsappReport.count()).toBe(0);
    });

    it('routes tapped IDs independently of their displayed titles and rejects forged confirmations', async () => {
      const request = await send('Cualquier título', {
        selectionId: 'report_request',
      });
      expect(request?.selectionId).toBe('report_request');
      expect(request?.replyText).toContain('qué necesitas solicitar');
      expect(ai.extract).not.toHaveBeenCalled();
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'REQUEST',
          description: 'Solicitud de menú sin confirmar',
        }),
      );
      const summary = await send('Necesito guantes');
      expect(summary?.replyKind).toBe('CONFIRMATION');
      const forged = await send('Sí', {
        selectionId: 'unknown_option',
        button: true,
      });
      expect(forged?.replyKind).toBe('REPORT_MENU');
      const stale = await send('Sí, registrar', {
        selectionId: 'report_confirm:older-summary',
        button: true,
      });
      expect(stale?.replyText).toContain('resumen anterior');
      expect(await prisma.whatsappReport.count()).toBe(0);
      await send('Cancelar', { selectionId: 'report_cancel', button: true });
    });

    it('shows two attendance buttons and starts entry by its stable ID without AI', async () => {
      expect(
        (await send('Entrada o salida', { selectionId: 'report_attendance' }))
          ?.replyKind,
      ).toBe('ATTENDANCE_MENU');
      const entry = await send('Registrar entrada', {
        selectionId: 'attendance_check_in',
        button: true,
      });
      expect(entry?.replyText).toContain('Indica el nombre de la obra');
      const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
        where: { phone: '573001234567' },
      });
      expect((conversation.draft as any).kind).toBe('CHECK_IN');
      expect(ai.extract).not.toHaveBeenCalled();
      expect(await prisma.worksiteAttendance.count()).toBe(0);
      await send('cancelar');
    });

    it('keeps an unfinished report when the employee greets or opens the menu again', async () => {
      await send('Petición general', { selectionId: 'report_request' });
      ai.extract.mockResolvedValue(
        extracted({ kind: 'REQUEST', description: 'Mi borrador pendiente' }),
      );
      await send('Mi borrador pendiente');
      const greeting = await send('Hola');
      expect(greeting?.replyText).toContain('reporte pendiente');
      expect(greeting?.replyKind).toBe('REPORT_MENU');
      const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
        where: { phone: '573001234567' },
      });
      expect((conversation.draft as any).description).toBe(
        'Mi borrador pendiente',
      );
      expect((conversation.draft as any).ready).toBe(true);
      await send('cancelar');
    });

    it('retries the same interactive menu after a delivery failure', async () => {
      cloud.reply.mockRejectedValueOnce(
        new Error('simulated menu send failure'),
      );
      const greeting = await send('Hola');
      expect(greeting?.replyKind).toBe('REPORT_MENU');
      expect(greeting?.replySentAt).toBeNull();
      await prisma.whatsappInboundMessage.update({
        where: { id: greeting!.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await inbox.tick();
      expect(cloud.reply).toHaveBeenLastCalledWith(
        '573001234567',
        greeting!.replyText,
        'REPORT_MENU',
      );
      expect(
        (
          await prisma.whatsappInboundMessage.findUniqueOrThrow({
            where: { id: greeting!.id },
          })
        ).replySentAt,
      ).not.toBeNull();
      expect(ai.extract).not.toHaveBeenCalled();
    });

    it('authenticates a signed webhook, records equipment damage once and keeps the employee attribution', async () => {
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'DAMAGE',
          subjectType: 'ASSET',
          subjectReference: asset.publicCode,
          description: 'Manguera hidráulica rota',
        }),
      );
      const first = await send('La retro QA-RETRO-02 tiene una manguera rota');
      expect(first?.replyText).toContain('Responde SÍ');
      expect(await prisma.whatsappReport.count()).toBe(0);
      const confirmed = await send('sí');
      expect(confirmed?.replyText).toContain('Registrado en REV');
      expect(
        (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }))
          .isDamaged,
      ).toBe(true);
      expect(
        await prisma.assetConditionEvent.count({
          where: { assetId: asset.id },
        }),
      ).toBe(1);
      await send('sí', { id: confirmed!.providerMessageId });
      expect(
        await prisma.whatsappReport.count({ where: { kind: 'DAMAGE' } }),
      ).toBe(1);
      const report = await prisma.whatsappReport.findFirstOrThrow({
        where: { kind: 'DAMAGE' },
        include: { alertRecipients: true },
      });
      expect(report.employeeId).toBe(employee.id);
      expect(report.sourceMessageIds).toEqual([
        first!.providerMessageId,
        confirmed!.providerMessageId,
      ]);
      expect(report.alertRecipients.map((r) => r.employeeId)).toEqual(
        expect.arrayContaining([office.id, manager.id, hector.id]),
      );
    });

    it('requires a photo, then updates equipment hour meter and evidence atomically', async () => {
      const data = extracted({
        kind: 'HOUR_METER',
        subjectType: 'ASSET',
        subjectReference: asset.publicCode,
        hours: 120.5,
      });
      ai.extract.mockResolvedValue(data);
      expect((await send('Horómetro QA-RETRO-02 120.5'))?.replyText).toContain(
        'foto',
      );
      expect((await send('sí'))?.replyText).toContain('faltan datos');
      ai.extract.mockResolvedValue({ ...data, photoHours: 120.5 });
      expect((await send('', { image: true }))?.replyText).toContain('120.5');
      await send('confirmar');
      expect(
        Number(
          (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }))
            .hourMeter,
        ),
      ).toBe(120.5);
      const reading = await prisma.assetHourReading.findFirstOrThrow({
        where: { assetId: asset.id },
      });
      expect(reading.evidenceFileObjectId).toBeTruthy();
      const report = await prisma.whatsappReport.findFirstOrThrow({
        where: { kind: 'HOUR_METER', assetId: asset.id },
        include: { evidence: true },
      });
      expect(report.evidence[0].fileObjectId).toBe(
        reading.evidenceFileObjectId,
      );
    });

    it('rejects a decreasing reading and a mismatch between photo and text', async () => {
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'HOUR_METER',
          subjectType: 'ASSET',
          subjectReference: asset.publicCode,
          hours: 110,
          photoHours: 110,
        }),
      );
      const low = await send('110 horas', { image: true });
      expect(low?.replyText).toContain('no puede disminuir');
      await send('cancelar');
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'HOUR_METER',
          subjectType: 'ASSET',
          subjectReference: asset.publicCode,
          hours: 130,
          photoHours: 135,
        }),
      );
      expect((await send('130', { image: true }))?.replyText).toContain(
        'Revisa la lectura',
      );
      await send('cancelar');
      expect(
        await prisma.assetHourReading.count({ where: { assetId: asset.id } }),
      ).toBe(1);
    });

    it('creates a general request and alerts managers, office and Hector without requiring accounts', async () => {
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'REQUEST',
          description: 'Necesito botas de seguridad talla 42',
        }),
      );
      await send('Necesito botas de seguridad talla 42');
      await send('sí');
      const request = await prisma.whatsappReport.findFirstOrThrow({
        where: { kind: 'REQUEST' },
        include: { alertRecipients: true },
      });
      expect(
        request.alertRecipients.find((r) => r.employeeId === hector.id)?.status,
      ).toBe('PENDING');
      expect(
        await prisma.notificationTopic.count({
          where: {
            entityType: 'WHATSAPP_REPORT',
            entityId: request.id,
            active: true,
          },
        }),
      ).toBe(1);
      const transport = {
        sendWhatsapp: jest.fn().mockResolvedValue({
          sent: true,
          providerMessageId: `qa-${randomUUID()}`,
        }),
      };
      // Unique provider IDs, like Meta, for each recipient.
      transport.sendWhatsapp.mockImplementation(async () => ({
        sent: true,
        providerMessageId: `qa-${randomUUID()}`,
      }));
      await new WhatsappReportAlertsService(prisma, transport as any).tick();
      expect(transport.sendWhatsapp).toHaveBeenCalledWith(
        '573004444444',
        expect.objectContaining({ body: expect.stringContaining('botas') }),
      );
      await records.resolveReport(
        request.id,
        process.env.WHATSAPP_REPORT_ACTOR_USER_ID!,
        'Botas solicitadas a compras',
      );
      expect(
        (
          await prisma.notificationTopic.findFirstOrThrow({
            where: { entityId: request.id },
          })
        ).active,
      ).toBe(false);
    });

    it('records entry and exit with separate photos, links the worksite, and closes the attendance', async () => {
      ai.extract.mockResolvedValue(
        extracted({ kind: 'CHECK_IN', worksiteReference: 'Obra QA única' }),
      );
      expect((await send('Llegué a obra QA única'))?.replyText).toContain(
        'foto',
      );
      await send('', { image: true });
      await send('sí');
      expect(
        await prisma.worksiteAttendance.count({
          where: { employeeId: employee.id, leftAt: null },
        }),
      ).toBe(1);
      expect(
        await prisma.employeeActivityNote.count({
          where: { employeeId: employee.id, customerWorksiteId: site.id },
        }),
      ).toBe(1);
      ai.extract.mockResolvedValue(
        extracted({ kind: 'CHECK_IN', worksiteReference: 'Obra QA única' }),
      );
      await send('Entrada de nuevo', { image: true });
      expect((await send('sí'))?.replyText).toContain('entrada abierta');
      await send('cancelar');
      ai.extract.mockResolvedValue(
        extracted({ kind: 'CHECK_OUT', worksiteReference: 'Obra QA única' }),
      );
      await send('Ya salí de la obra', { image: true });
      await send('sí');
      const attendance = await prisma.worksiteAttendance.findFirstOrThrow({
        where: { employeeId: employee.id },
      });
      expect(attendance.leftAt!.getTime()).toBeGreaterThan(
        attendance.enteredAt.getTime(),
      );
      const reports = await prisma.whatsappReport.findMany({
        where: {
          employeeId: employee.id,
          kind: { in: ['CHECK_IN', 'CHECK_OUT'] },
        },
        include: { evidence: true },
      });
      expect(reports).toHaveLength(2);
      expect(reports.every((r) => r.evidence.length === 1)).toBe(true);
      expect(reports[0].evidence[0].fileObjectId).not.toBe(
        reports[1].evidence[0].fileObjectId,
      );
    });

    it('requires an open entry for an exit and never inserts a partial report', async () => {
      ai.extract.mockResolvedValue(
        extracted({ kind: 'CHECK_OUT', worksiteReference: 'Obra QA única' }),
      );
      await send('Salí', { image: true });
      expect((await send('sí'))?.replyText).toContain('No tienes una entrada');
      expect(
        await prisma.whatsappReport.count({ where: { kind: 'CHECK_OUT' } }),
      ).toBe(1);
      await send('cancelar');
    });

    it('records vehicle damage and vehicle hour readings with evidence', async () => {
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'DAMAGE',
          subjectType: 'VEHICLE',
          subjectReference: vehicle.plate,
          description: 'Llanta pinchada',
        }),
      );
      await send('El vehículo tiene una llanta pinchada');
      await send('sí');
      expect(
        await prisma.whatsappReport.count({
          where: { kind: 'DAMAGE', vehicleId: vehicle.id },
        }),
      ).toBe(1);
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'HOUR_METER',
          subjectType: 'VEHICLE',
          subjectReference: vehicle.plate,
          hours: 51,
          photoHours: 51,
        }),
      );
      await send('51 horas', { image: true });
      await send('sí');
      expect(
        Number(
          (
            await prisma.vehicleHourReading.findFirstOrThrow({
              where: { vehicleId: vehicle.id },
            })
          ).hours,
        ),
      ).toBe(51);
    });

    it('discards the previous equipment photo when the subject is corrected', async () => {
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'HOUR_METER',
          subjectType: 'ASSET',
          subjectReference: asset.publicCode,
          hours: 125,
          photoHours: 125,
        }),
      );
      await send('125 horas', { image: true });
      ai.extract.mockResolvedValue(
        extracted({
          kind: 'HOUR_METER',
          subjectType: 'VEHICLE',
          subjectReference: vehicle.plate,
          hours: 125,
        }),
      );
      expect(
        (await send('Corrijo, era el vehículo QA1234'))?.replyText,
      ).toContain('foto');
      const before = await prisma.whatsappReport.count();
      await send('sí');
      expect(await prisma.whatsappReport.count()).toBe(before);
      await send('cancelar');
    });

    it('expires a draft without accepting a later confirmation', async () => {
      ai.extract.mockResolvedValue(
        extracted({ kind: 'REQUEST', description: 'Borrador vencido QA' }),
      );
      await send('Borrador vencido QA');
      await prisma.whatsappConversation.update({
        where: { phone: '573001234567' },
        data: { expiresAt: new Date(0) },
      });
      expect((await send('sí'))?.replyText).toContain('faltan datos');
      expect(
        await prisma.whatsappReport.count({
          where: { description: 'Borrador vencido QA' },
        }),
      ).toBe(0);
    });

    it('retries a failed reply without inserting the already committed report again', async () => {
      ai.extract.mockResolvedValue(
        extracted({ kind: 'REQUEST', description: 'Respuesta pendiente QA' }),
      );
      await send('Respuesta pendiente QA');
      cloud.reply.mockRejectedValueOnce(new Error('simulated send failure'));
      const confirmation = await send('sí');
      expect(confirmation?.status).toBe('PROCESSED');
      expect(confirmation?.replySentAt).toBeNull();
      await prisma.whatsappInboundMessage.update({
        where: { id: confirmation!.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await inbox.tick();
      expect(
        (
          await prisma.whatsappInboundMessage.findUniqueOrThrow({
            where: { id: confirmation!.id },
          })
        ).replySentAt,
      ).not.toBeNull();
      expect(
        await prisma.whatsappReport.count({
          where: { description: 'Respuesta pendiente QA' },
        }),
      ).toBe(1);
    });

    it('rejects unknown and ambiguous employee phones, foreign business numbers and invalid signatures', async () => {
      expect((await send('petición', { from: '573009999999' }))?.status).toBe(
        'REJECTED',
      );
      expect(
        await send('petición', { phoneId: 'another-business' }),
      ).toBeNull();
      await prisma.employee.create({
        data: { name: 'Duplicado QA', role: 'OTHER', phone: '3001234567' },
      });
      expect((await send('petición'))?.status).toBe('REJECTED');
      expect(ai.extract).not.toHaveBeenCalled();
      expect(() =>
        webhook.receive(
          { rawBody: Buffer.from('{}') } as any,
          'sha256=invalid',
          {},
        ),
      ).toThrow();
      await prisma.employee.deleteMany({ where: { name: 'Duplicado QA' } });
    });

    it('retries model failures durably, then processes successfully without losing the original message', async () => {
      ai.extract.mockRejectedValueOnce(new Error('simulated outage'));
      const initial = await send('Necesito guantes');
      expect(initial?.status).toBe('QUEUED');
      expect(initial?.text).toBe('Necesito guantes');
      await prisma.whatsappInboundMessage.update({
        where: { id: initial!.id },
        data: { nextAttemptAt: new Date(0) },
      });
      ai.extract.mockResolvedValue(
        extracted({ kind: 'REQUEST', description: 'Necesito guantes' }),
      );
      await Promise.all([
        inbox.tick(),
        new WhatsappInboxService(
          prisma,
          cloud as any,
          files as any,
          ai as any,
          records,
        ).tick(),
      ]);
      expect(
        (
          await prisma.whatsappInboundMessage.findUniqueOrThrow({
            where: { id: initial!.id },
          })
        ).status,
      ).toBe('PROCESSED');
      await send('sí');
      expect(
        await prisma.whatsappReport.count({
          where: { description: 'Necesito guantes' },
        }),
      ).toBe(1);
    });

    it('serializes concurrent hour meter updates and rolls back the stale reading', async () => {
      const evidence = await prisma.fileObject.findFirstOrThrow({
        where: { entityType: 'EMPLOYEE', entityId: employee.id },
      });
      const draft = {
        ...emptyDraft(),
        kind: 'HOUR_METER' as const,
        hours: 140,
        evidenceFileIds: [evidence.id],
      };
      const target = {
        assetId: asset.id,
        vehicleId: null,
        customerWorksiteId: null,
        label: asset.publicCode,
      };
      const newer = prisma.$transaction((tx) =>
        records.record(
          tx,
          employee,
          { ...draft, hours: 150 },
          target,
          `qa-concurrent-${randomUUID()}`,
        ),
      );
      const older = prisma.$transaction((tx) =>
        records.record(
          tx,
          employee,
          { ...draft, hours: 140 },
          target,
          `qa-concurrent-${randomUUID()}`,
        ),
      );
      const results = await Promise.allSettled([newer, older]);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      expect(
        Number(
          (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }))
            .hourMeter,
        ),
      ).toBe(150);
      const invalid = await prisma.assetHourReading.count({
        where: { assetId: asset.id, previousHours: { gt: 140 }, hours: 140 },
      });
      expect(invalid).toBe(0);
    });
    it('records a tapped confirmation only for the exact current summary and does not repeat it', async () => {
      await send('Petición', { selectionId: 'report_request' });
      ai.extract.mockResolvedValue(
        extracted({ kind: 'REQUEST', description: 'Petición con botón QA' }),
      );
      const summary = await send('Petición con botón QA');
      expect(summary?.replyKind).toBe('CONFIRMATION');
      expect(cloud.reply).toHaveBeenCalledWith(
        '573001234567',
        summary!.replyText,
        'CONFIRMATION',
        summary!.id,
      );
      const result = await send('Sí, registrar', {
        selectionId: `report_confirm:${summary!.id}`,
        button: true,
      });
      expect(result?.replyText).toContain('Registrado en REV');
      expect(result?.replyKind).toBe('REPORT_MENU');
      await send('Sí, registrar', {
        selectionId: `report_confirm:${summary!.id}`,
        button: true,
      });
      expect(
        await prisma.whatsappReport.count({
          where: { description: 'Petición con botón QA' },
        }),
      ).toBe(1);
    });
  },
);

describe('WhatsApp phone ownership', () => {
  it('normalizes Colombian mobile formatting without accepting short or malformed numbers', () => {
    expect(normalizePhone('+57 (300) 123-4567')).toBe('573001234567');
    expect(normalizePhone('300 123 4567')).toBe('573001234567');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
