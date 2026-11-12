import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWebhookController } from '../notifications/whatsapp-webhook.controller';
import { WhatsappWebhookService } from '../notifications/whatsapp-webhook.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';
import { Prisma } from '@prisma/client';
import { worksitePicker } from './whatsapp-worksites';
import { equipmentPicker } from './whatsapp-equipment';
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
    const ai = {
      extract: jest.fn(),
      equipmentSearchTerms: jest.fn(async (reference: string) => [reference]),
      suggestWorksites: jest.fn(
        async (
          _reference: string,
          _customer: string | null,
          candidates: { id: string }[],
        ) => candidates.slice(0, 5).map((site) => site.id),
      ),
    };
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
        location?: { latitude: number; longitude: number };
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
                        : options.location
                          ? 'location'
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
                        : options.location
                          ? { location: options.location }
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
      // Prisma-generated baselines omit SQL CHECK constraints. Load the actual
      // production association guard so attendance is tested against that rule.
      const activityMigration = readFileSync(
        join(
          __dirname,
          '../../prisma/migrations/20261009120000_employee_activity_warehouse/migration.sql',
        ),
        'utf8',
      );
      const associationSql = activityMigration
        .slice(
          activityMigration.indexOf(
            'ALTER TABLE "EmployeeActivityNote" DROP CONSTRAINT',
          ),
        )
        .replace(
          'DROP CONSTRAINT "EmployeeActivityNote_associations_check"',
          'DROP CONSTRAINT IF EXISTS "EmployeeActivityNote_associations_check"',
        );
      for (const statement of associationSql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await prisma.$executeRawUnsafe(statement);
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
      ai.equipmentSearchTerms.mockClear();
      ai.suggestWorksites.mockClear();
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
      expect(entry?.replyText).toContain('Ver obras');
      expect(entry?.replyKind).toBe('WORKSITE_MENU');
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
      expect(confirmed?.replyText).toContain(
        'Tu reporte de daño quedó registrado correctamente.',
      );
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

    it('records entry and exit without an asset under the production activity constraint, with separate photos', async () => {
      ai.extract.mockResolvedValue(
        extracted({ kind: 'CHECK_IN', worksiteReference: 'Obra QA única' }),
      );
      expect((await send('Llegué a obra QA única'))?.replyText).toContain(
        'foto',
      );
      await send('', { image: true });
      const entered = await send('sí');
      expect(entered?.status).toBe('PROCESSED');
      expect(entered?.replyText).toContain(
        'Tu entrada a obra quedó registrada correctamente.',
      );
      expect(
        await prisma.worksiteAttendance.count({
          where: { employeeId: employee.id, leftAt: null },
        }),
      ).toBe(1);
      expect(
        await prisma.employeeActivityNote.count({
          where: { employeeId: employee.id, customerWorksiteId: site.id },
        }),
      ).toBe(0);
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
      expect((await send('Salí', { image: true }))?.replyText).toContain(
        'No tienes una entrada',
      );
      expect((await send('sí'))?.replyText).toContain('faltan datos');
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
      expect(result?.replyText).toContain(
        'Tu petición quedó registrada correctamente.',
      );
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

    describe('equipment selection and durable phone memory', () => {
      const phone = '573001234567';
      const conversation = () =>
        prisma.whatsappConversation.findUniqueOrThrow({ where: { phone } });
      const openCatalog = async () => {
        const prompt = await send('Horómetro', {
          selectionId: 'report_hour_meter',
        });
        const buttons = (prompt!.replyOptions as any).buttons;
        return send('Ver lista completa', {
          selectionId: buttons.find((button: any) =>
            button.id.startsWith('equipment_catalog:'),
          ).id,
        });
      };
      const rows = (message: any) =>
        message.replyOptions.rows as {
          id: string;
          title: string;
          description: string;
        }[];
      beforeEach(async () => {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { active: true, phone, userId: null },
        });
        await prisma.asset.update({
          where: { id: asset.id },
          data: { active: true, deletedAt: null },
        });
        await prisma.whatsappConversation.update({
          where: { phone },
          data: {
            draft: emptyDraft() as any,
            lastEquipment: Prisma.DbNull,
            expiresAt: new Date(0),
          },
        });
      });

      it('selects the exact tapped machine, remembers only confirmed reports and survives draft expiry', async () => {
        const menu = await openCatalog();
        expect(menu?.replyKind).toBe('EQUIPMENT_MENU');
        expect(ai.extract).not.toHaveBeenCalled();
        const selection = rows(menu).find((r) =>
          r.title.endsWith(`#${asset.internalNumber}`),
        )!;
        expect(selection).toBeDefined();
        const picked = await send('Título sin códigos', {
          selectionId: selection.id,
        });
        expect(picked?.replyText).toContain('foto');
        expect((await conversation()).lastEquipment).toEqual({
          type: 'ASSET',
          id: asset.id,
        });
        ai.extract.mockResolvedValue(
          extracted({ kind: 'HOUR_METER', hours: 160, photoHours: 160 }),
        );
        const summary = await send('', { image: true });
        expect(summary?.replyKind).toBe('CONFIRMATION');
        expect(summary?.replyText).toContain(
          `Retroexcavadora QA #${asset.internalNumber}`,
        );
        expect(summary?.replyText).not.toContain(asset.publicCode);
        await send('Sí', { selectionId: `report_confirm:${summary!.id}` });
        expect((await conversation()).lastEquipment).toEqual({
          type: 'ASSET',
          id: asset.id,
        });
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { expiresAt: new Date(0) },
        });
        ai.extract.mockClear();
        const recent = await send('Horómetro', {
          selectionId: 'report_hour_meter',
        });
        expect(recent?.replyText).toContain('última máquina');
        expect(recent?.replyText).toContain(
          `Retroexcavadora QA #${asset.internalNumber}`,
        );
        expect(
          (recent!.replyOptions as any).buttons.map((b: any) => b.title),
        ).toEqual(['Usar esta máquina', 'Buscar otra', 'Ver lista completa']);
        expect(ai.extract).not.toHaveBeenCalled();
        await send('Cancelar');
        expect((await conversation()).lastEquipment).toEqual({
          type: 'ASSET',
          id: asset.id,
        });
      });

      it('retains a photo sent before choosing the machine and never records an unconfirmed selection', async () => {
        ai.extract.mockResolvedValue(
          extracted({ kind: 'HOUR_METER', hours: 170, photoHours: 170 }),
        );
        const prompt = await send('Horómetro', { image: true });
        const menu = await send('Ver lista completa', {
          selectionId: (prompt!.replyOptions as any).buttons[0].id,
        });
        expect(menu?.replyKind).toBe('EQUIPMENT_MENU');
        const picked = await send('Mi máquina', {
          selectionId: rows(menu).find((r) =>
            r.title.endsWith(`#${asset.internalNumber}`),
          )!.id,
        });
        expect(picked?.replyKind).toBe('CONFIRMATION');
        expect(picked?.replyText).toContain('Fotos: 1');
        await send('Cancelar');
        expect((await conversation()).lastEquipment).toEqual({
          type: 'ASSET',
          id: asset.id,
        });
      });

      it('rejects stale, expired and deactivated selections instead of trusting a supplied title or id', async () => {
        const first = await openCatalog();
        const second = await openCatalog();
        const stale = await send('QA-RETRO-02', {
          selectionId: rows(first)[0].id,
        });
        expect(stale?.replyKind).toBe('EQUIPMENT_MENU');
        expect((await conversation()).draft).not.toHaveProperty(
          'selectedEquipment',
        );
        const current = await openCatalog();
        const choice = rows(current).find((r) =>
          r.title.endsWith(`#${asset.internalNumber}`),
        )!;
        await prisma.asset.update({
          where: { id: asset.id },
          data: { active: false },
        });
        const unavailable = await send('Sí', { selectionId: choice.id });
        expect(unavailable?.replyKind).toBe('EQUIPMENT_MENU');
        expect((await conversation()).draft).not.toHaveProperty(
          'selectedEquipment',
        );
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { expiresAt: new Date(0) },
        });
        const expired = await send('Sí', { selectionId: rows(second)[0].id });
        expect(expired?.replyKind).toBe('REPORT_MENU');
        expect(ai.extract).not.toHaveBeenCalled();
      });

      it('requires fresh hours and evidence after switching machines and retries the identical menu', async () => {
        const other = await prisma.asset.create({
          data: {
            skuId: asset.skuId,
            warehouseOwnerId: asset.warehouseOwnerId,
            publicCode: `QA-OTHER-${randomUUID()}`,
            internalNumber: 99,
          },
        });
        const menu = await openCatalog();
        await send('Mi máquina', {
          selectionId: rows(menu).find((r) =>
            r.title.endsWith(`#${asset.internalNumber}`),
          )!.id,
        });
        ai.extract.mockResolvedValue(
          extracted({ kind: 'HOUR_METER', hours: 180, photoHours: 180 }),
        );
        const oldSummary = await send('', { image: true });
        cloud.reply.mockRejectedValueOnce(new Error('temporary'));
        const nextMenu = await send('Ver máquinas');
        expect(nextMenu?.replySentAt).toBeNull();
        await prisma.whatsappInboundMessage.update({
          where: { id: nextMenu!.id },
          data: { nextAttemptAt: new Date(0) },
        });
        await inbox.tick();
        expect(cloud.reply).toHaveBeenLastCalledWith(
          phone,
          nextMenu!.replyText,
          'EQUIPMENT_MENU',
          undefined,
          nextMenu!.replyOptions,
        );
        const picked = await send('Otra', {
          selectionId: rows(nextMenu).find((r) =>
            r.title.endsWith(`#${other.internalNumber}`),
          )!.id,
        });
        expect(picked?.replyText).toContain('foto');
        expect((await conversation()).draft).toMatchObject({
          hours: null,
          photoHours: null,
          evidenceFileIds: [],
        });
        await send('Sí', { selectionId: `report_confirm:${oldSummary!.id}` });
        expect((await conversation()).lastEquipment).toEqual({
          type: 'ASSET',
          id: other.id,
        });
        await prisma.asset.delete({ where: { id: other.id } });
      });

      it('isolates memory when a number is reassigned to another employee', async () => {
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { lastEquipment: { type: 'ASSET', id: asset.id } },
        });
        await prisma.employee.update({
          where: { id: employee.id },
          data: { phone: '3008888888' },
        });
        const replacement = await prisma.employee.create({
          data: { name: 'Otro operario', role: 'OTHER', phone },
        });
        const menu = await send('Horómetro', {
          selectionId: 'report_hour_meter',
        });
        expect(menu?.replyText).not.toContain('última máquina');
        expect((await conversation()).lastEquipment).toBeNull();
        await prisma.employee.update({
          where: { id: replacement.id },
          data: { phone: null },
        });
        await prisma.employee.update({
          where: { id: employee.id },
          data: { phone },
        });
      });

      it('pages through every eligible asset and vehicle without exposing inactive, deleted or nonhourly assets', async () => {
        const created: string[] = [];
        const sku = await prisma.sku.findUniqueOrThrow({
          where: { id: asset.skuId },
        });
        const dailySku = await prisma.sku.create({
          data: {
            name: 'Equipo sin horómetro',
            assetFamilyId: sku.assetFamilyId,
            chargeType: 'DAY',
          },
        });
        for (let n = 0; n < 19; n++) {
          const item = await prisma.asset.create({
            data: {
              skuId: n === 18 ? dailySku.id : asset.skuId,
              warehouseOwnerId: asset.warehouseOwnerId,
              publicCode: `QA-PAGE-${n}-${randomUUID()}`,
              internalNumber: 200 + n,
              active: n !== 16,
              deletedAt: n === 17 ? new Date() : null,
            },
          });
          created.push(item.id);
        }
        const eligible = await prisma.asset.findMany({
          where: { active: true, deletedAt: null, sku: { chargeType: 'HOUR' } },
          select: { id: true },
        });
        const seen: string[] = [];
        let page = 0;
        for (;;) {
          const picker = await equipmentPicker(
            prisma,
            'HOUR_METER',
            undefined,
            page,
          );
          expect(picker.options?.type).toBe('list');
          const menuRows = (picker.options as any).rows;
          expect(menuRows.length).toBeLessThanOrEqual(10);
          expect(
            menuRows.every(
              (r: any) =>
                r.title.length <= 24 && (r.description?.length ?? 0) <= 72,
            ),
          ).toBe(true);
          seen.push(
            ...picker.state.choices
              .filter((c) => c.type === 'ASSET')
              .map((c) => c.id),
          );
          if (!menuRows.some((r: any) => r.title === 'Más máquinas →')) break;
          page++;
          expect(page).toBeLessThan(10);
        }
        expect(seen.sort()).toEqual(eligible.map((a) => a.id).sort());
        expect(new Set(seen).size).toBe(seen.length);
        const damage = await equipmentPicker(prisma, 'DAMAGE', {
          type: 'ASSET',
          id: created[18],
        });
        expect(damage.state.recent).toBe(true);
        const hours = await equipmentPicker(prisma, 'HOUR_METER', {
          type: 'ASSET',
          id: created[18],
        });
        expect(hours.state.recent).toBe(false);
        await prisma.asset.deleteMany({ where: { id: { in: created } } });
        await prisma.sku.delete({ where: { id: dailySku.id } });
      });
    });

    describe('attendance with location OR photo', () => {
      const phone = '573001234567';
      const coords = { latitude: 3.4516, longitude: -76.532 };
      const currentDraft = async () =>
        (
          await prisma.whatsappConversation.findUniqueOrThrow({
            where: { phone },
          })
        ).draft as any;
      beforeEach(async () => {
        await prisma.worksiteAttendance.deleteMany({
          where: { employeeId: employee.id },
        });
        await send('Cancelar');
        cloud.photo.mockClear();
        ai.extract.mockClear();
      });
      async function start(kind: 'CHECK_IN' | 'CHECK_OUT') {
        await send('Asistencia', {
          selectionId:
            kind === 'CHECK_IN'
              ? 'attendance_check_in'
              : 'attendance_check_out',
        });
        ai.extract.mockResolvedValue(
          extracted({ kind, worksiteReference: 'Obra QA única' }),
        );
        const question = await send('Obra QA única');
        const open = await prisma.worksiteAttendance.count({
          where: { employeeId: employee.id, leftAt: null },
        });
        expect(question?.replyText).toContain(
          kind === 'CHECK_OUT' && !open
            ? 'No tienes una entrada'
            : 'ubicación o una foto',
        );
      }
      it('registers entry and exit with location only, without downloading a photo or calling AI for coordinates', async () => {
        await start('CHECK_IN');
        ai.extract.mockClear();
        const summary = await send('', { location: coords });
        expect(summary?.replyKind).toBe('CONFIRMATION');
        expect(summary?.replyText).toContain('Ubicación: 3.451600, -76.532000');
        expect(ai.extract).not.toHaveBeenCalled();
        expect(cloud.photo).not.toHaveBeenCalled();
        const entry = await send('Sí', {
          selectionId: `report_confirm:${summary!.id}`,
        });
        expect(entry?.replyText).toContain(
          'Tu entrada a obra quedó registrada correctamente.',
        );
        const report = await prisma.whatsappReport.findUniqueOrThrow({
          where: { sourceMessageId: entry!.providerMessageId },
          include: { evidence: true },
        });
        expect(report.evidence).toHaveLength(0);
        expect(report.location).toMatchObject({
          ...coords,
          sourceMessageId: summary!.providerMessageId,
          receivedAt: summary!.createdAt.toISOString(),
          sentAt: summary!.sentAt.toISOString(),
        });
        await send('Sí', {
          id: entry!.providerMessageId,
          selectionId: `report_confirm:${summary!.id}`,
        });
        expect(
          await prisma.whatsappReport.count({
            where: { sourceMessageId: entry!.providerMessageId },
          }),
        ).toBe(1);
        await start('CHECK_OUT');
        const exitSummary = await send('', {
          location: { latitude: 3.45, longitude: -76.53 },
        });
        const exit = await send('Sí', {
          selectionId: `report_confirm:${exitSummary!.id}`,
        });
        expect(exit?.replyText).toContain(
          'Tu salida de obra quedó registrada correctamente.',
        );
        const attendance = await prisma.worksiteAttendance.findFirstOrThrow({
          where: { employeeId: employee.id },
        });
        expect(attendance.leftAt).not.toBeNull();
        const out = await prisma.whatsappReport.findUniqueOrThrow({
          where: { id: attendance.checkOutReportId! },
          include: { evidence: true },
        });
        expect(out.evidence).toHaveLength(0);
        expect(out.location).toMatchObject({
          latitude: 3.45,
          longitude: -76.53,
        });
      });
      it('uses the latest alternative, invalidates older confirmations, and never records both', async () => {
        await start('CHECK_IN');
        const photo = await send('', { image: true });
        expect((await currentDraft()).evidenceFileIds).toHaveLength(1);
        const location = await send('', { location: coords });
        expect(location?.replyKind).toBe('CONFIRMATION');
        expect((await currentDraft()).evidenceFileIds).toEqual([]);
        const invalid = await send('Sí', {
          selectionId: `report_confirm:${photo!.id}`,
        });
        expect(invalid?.replyText).toContain('resumen anterior');
        const replacementPhoto = await send('', { image: true });
        expect((await currentDraft()).location).toBeUndefined();
        expect(replacementPhoto?.replyKind).toBe('CONFIRMATION');
        const done = await send('Sí', {
          selectionId: `report_confirm:${replacementPhoto!.id}`,
        });
        const report = await prisma.whatsappReport.findUniqueOrThrow({
          where: { sourceMessageId: done!.providerMessageId },
          include: { evidence: true },
        });
        expect(report.location).toBeNull();
        expect(report.evidence).toHaveLength(1);
      });
      it('rejects invalid coordinate ranges and preserves zero as a valid coordinate', async () => {
        await start('CHECK_IN');
        for (const location of [
          { latitude: 91, longitude: 0 },
          { latitude: 0, longitude: -181 },
        ]) {
          const bad = await send('', { location });
          expect(bad?.replyText).toContain('No pude leer esa ubicación');
          expect((await currentDraft()).location).toBeUndefined();
        }
        const good = await send('', {
          location: { latitude: 0, longitude: 0 },
        });
        expect(good?.replyKind).toBe('CONFIRMATION');
        expect((await currentDraft()).location).toMatchObject({
          latitude: 0,
          longitude: 0,
        });
      });
      it('does not let location replace the mandatory hour-meter photo', async () => {
        await send('Horómetro', { selectionId: 'report_hour_meter' });
        const reply = await send('', { location: coords });
        expect(reply?.replyText).toContain('foto legible del medidor');
        expect((await currentDraft()).location).toBeUndefined();
        expect(ai.extract).not.toHaveBeenCalled();
      });
      it('retains a location sent first when selecting entry, but clears it on a different worksite', async () => {
        const first = await send('', { location: coords });
        expect(first?.replyKind).toBe('ATTENDANCE_MENU');
        expect(ai.extract).not.toHaveBeenCalled();
        await send('Entrada', { selectionId: 'attendance_check_in' });
        ai.extract.mockResolvedValue(
          extracted({ kind: 'CHECK_IN', worksiteReference: 'Obra QA única' }),
        );
        const summary = await send('Obra QA única');
        expect(summary?.replyKind).toBe('CONFIRMATION');
        expect((await currentDraft()).location).toMatchObject(coords);
        expect((await currentDraft()).occurredAt).toBe(
          first!.sentAt.toISOString(),
        );
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'CHECK_IN',
            worksiteReference: 'Otra obra por corregir',
          }),
        );
        await send('Obra distinta por corregir');
        expect((await currentDraft()).location).toBeUndefined();
        expect((await currentDraft()).ready).toBe(false);
      });
      it('validates location provenance against the signed inbound message and rejects mixed evidence', async () => {
        await start('CHECK_IN');
        await send('', { location: coords });
        const draft = await currentDraft();
        const target = (await records.resolve(draft)).target!;
        await expect(
          prisma.$transaction((tx) =>
            records.record(
              tx,
              employee,
              { ...draft, location: { ...draft.location, latitude: 3.46 } },
              target,
              `qa-tampered-location-${randomUUID()}`,
            ),
          ),
        ).rejects.toThrow('No pude validar la ubicación');
        const file = await files.storeWhatsappEvidence(employee.id);
        await expect(
          prisma.$transaction((tx) =>
            records.record(
              tx,
              employee,
              { ...draft, evidenceFileIds: [file.files[0].id] },
              target,
              `qa-mixed-evidence-${randomUUID()}`,
            ),
          ),
        ).rejects.toThrow('solo una');
      });
      it('requires a new evidence choice after cancellation or an expired draft', async () => {
        await start('CHECK_IN');
        await send('', { location: coords });
        await send('Cancelar');
        expect((await currentDraft()).location).toBeUndefined();
        await start('CHECK_IN');
        await send('', { location: coords });
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { expiresAt: new Date(0) },
        });
        await start('CHECK_OUT');
        expect((await currentDraft()).location).toBeUndefined();
        expect((await currentDraft()).ready).toBe(false);
      });
    });

    describe('worksite selection and exit from the open entry', () => {
      const phone = '573001234567';
      const draft = async () =>
        (
          await prisma.whatsappConversation.findUniqueOrThrow({
            where: { phone },
          })
        ).draft as any;
      async function openEntry() {
        const report = await prisma.whatsappReport.create({
          data: {
            employeeId: employee.id,
            kind: 'CHECK_IN',
            customerWorksiteId: site.id,
            description: 'QA open entry',
            occurredAt: new Date(Date.now() - 7200000),
            sourceMessageId: `qa-open-${randomUUID()}`,
          },
        });
        return prisma.worksiteAttendance.create({
          data: {
            employeeId: employee.id,
            customerWorksiteId: site.id,
            enteredAt: report.occurredAt,
            checkInReportId: report.id,
          },
        });
      }
      beforeEach(async () => {
        await prisma.worksiteAttendance.deleteMany({
          where: { employeeId: employee.id },
        });
        await send('Cancelar');
        ai.extract.mockClear();
      });
      it('uses the open entry for exit despite alternative names, preserving the original photo until explicit confirmation', async () => {
        const open = await openEntry();
        ai.extract.mockResolvedValue(extracted({ kind: 'CHECK_OUT' }));
        const prompt = await send('Salida de obra');
        expect(prompt?.replyText).toContain(
          'Tu entrada abierta es en Obra QA única',
        );
        const photo = await send('', { image: true });
        expect(photo?.replyKind).toBe('CONFIRMATION');
        const originalEvidence = (await draft()).evidenceFileIds;
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'CHECK_OUT',
            worksiteReference: 'universidad Camacho',
            customerReference: 'prodecon',
          }),
        );
        await send('Salida de universidad Camacho cliente prodecon');
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'CHECK_OUT',
            worksiteReference: 'Colegio Camacho',
            customerReference: 'prodecon',
          }),
        );
        const corrected = await send('Colegio Camacho');
        expect(corrected?.replyText).toContain('Obra QA única (Cliente QA)');
        expect(corrected?.replyKind).toBe('CONFIRMATION');
        expect((await draft()).evidenceFileIds).toEqual(originalEvidence);
        expect(
          (
            await prisma.worksiteAttendance.findUniqueOrThrow({
              where: { id: open.id },
            })
          ).leftAt,
        ).toBeNull();
        await send('Sí', { selectionId: `report_confirm:${corrected!.id}` });
        const closed = await prisma.worksiteAttendance.findUniqueOrThrow({
          where: { id: open.id },
        });
        expect(closed.leftAt).not.toBeNull();
        const report = await prisma.whatsappReport.findUniqueOrThrow({
          where: { id: closed.checkOutReportId! },
          include: { evidence: true },
        });
        expect(report.customerWorksiteId).toBe(site.id);
        expect(report.evidence.map((e) => e.fileObjectId)).toEqual(
          originalEvidence,
        );
      });
      it('does not offer another employee’s entry and revalidates an entry closed before confirmation', async () => {
        const noEntry = await send('Salida', {
          selectionId: 'attendance_check_out',
        });
        expect(noEntry?.replyText).toContain('No tienes una entrada abierta');
        const open = await openEntry();
        ai.extract.mockResolvedValue(extracted({ kind: 'CHECK_OUT' }));
        const summary = await send('', { image: true });
        expect(summary?.replyKind).toBe('CONFIRMATION');
        await prisma.worksiteAttendance.update({
          where: { id: open.id },
          data: { leftAt: new Date() },
        });
        const before = await prisma.whatsappReport.count({
          where: { kind: 'CHECK_OUT' },
        });
        const result = await send('Sí', {
          selectionId: `report_confirm:${summary!.id}`,
        });
        expect(result?.replyText).toContain('No tienes una entrada abierta');
        expect(
          await prisma.whatsappReport.count({ where: { kind: 'CHECK_OUT' } }),
        ).toBe(before);
      });
      it('lets an operator select an entry worksite by a native ID without typing its name or using AI', async () => {
        const menu = await send('Entrada', {
          selectionId: 'attendance_check_in',
        });
        expect(menu?.replyKind).toBe('WORKSITE_MENU');
        const state = (await draft()).worksiteMenu;
        const row = (menu!.replyOptions as any).rows[
          state.choices.indexOf(site.id)
        ];
        expect(row).toBeDefined();
        const selected = await send('Título cualquiera', {
          selectionId: row.id,
        });
        expect(selected?.replyText).toContain(
          'Obra seleccionada: Obra QA única',
        );
        expect((await draft()).selectedWorksiteId).toBe(site.id);
        expect(ai.extract).not.toHaveBeenCalled();
        expect(cloud.reply).toHaveBeenCalledWith(
          phone,
          menu!.replyText,
          'WORKSITE_MENU',
          undefined,
          menu!.replyOptions,
        );
      });
      it('recognizes word fragments such as Colegio Camacho and offers choices for ambiguous worksites', async () => {
        const worksite = await prisma.worksite.create({
          data: { name: 'Colegio Unicamacho' },
        });
        const link = await prisma.customerWorksite.create({
          data: { customerId: site.customerId, worksiteId: worksite.id },
        });
        ai.extract.mockResolvedValue(
          extracted({ kind: 'CHECK_IN', worksiteReference: 'Colegio Camacho' }),
        );
        const summary = await send('Colegio Camacho', { image: true });
        expect(summary?.replyKind).toBe('CONFIRMATION');
        expect(summary?.replyText).toContain('Colegio Unicamacho');
        await send('Cancelar');
        const duplicateCustomer = await prisma.customer.create({
          data: {
            name: 'Otro cliente QA',
            identityDocumentType: 'NIT',
            nitOrId: randomUUID(),
          },
        });
        const other = await prisma.customerWorksite.create({
          data: { customerId: duplicateCustomer.id, worksiteId: worksite.id },
        });
        const ambiguous = await send('Colegio Camacho', { image: true });
        expect(ambiguous?.replyKind).toBe('WORKSITE_MENU');
        expect((await draft()).ready).toBe(false);
        expect((await draft()).evidenceFileIds).toHaveLength(1);
        const state = (await draft()).worksiteMenu;
        const row = (ambiguous!.replyOptions as any).rows[
          state.choices.indexOf(link.id)
        ];
        const picked = await send('La obra correcta', { selectionId: row.id });
        expect(picked?.replyKind).toBe('CONFIRMATION');
        expect(picked?.replyText).toContain('Cliente QA');
        await send('Cancelar');
        await prisma.customerWorksite.deleteMany({
          where: { id: { in: [link.id, other.id] } },
        });
        await prisma.customer.delete({ where: { id: duplicateCustomer.id } });
        await prisma.worksite.delete({ where: { id: worksite.id } });
      });
      it('rejects stale or inactive selections, and clears old evidence when switching a selected worksite', async () => {
        const first = await send('Entrada', {
          selectionId: 'attendance_check_in',
        });
        const second = await send('Entrada', {
          selectionId: 'attendance_check_in',
        });
        await send('Vieja', {
          selectionId: (first!.replyOptions as any).rows[0].id,
        });
        expect((await draft()).selectedWorksiteId).toBeUndefined();
        const current = await send('Entrada', {
          selectionId: 'attendance_check_in',
        });
        await prisma.customerWorksite.update({
          where: { id: site.id },
          data: { active: false },
        });
        await send('Inactiva', {
          selectionId: (current!.replyOptions as any).rows[0].id,
        });
        expect((await draft()).selectedWorksiteId).toBeUndefined();
        await prisma.customerWorksite.update({
          where: { id: site.id },
          data: { active: true },
        });
        const live = await send('Entrada', {
          selectionId: 'attendance_check_in',
        });
        await send('Mi obra', {
          selectionId: (live!.replyOptions as any).rows[0].id,
        });
        ai.extract.mockResolvedValue(
          extracted({ kind: 'CHECK_IN', worksiteReference: 'Obra QA única' }),
        );
        await send('', { image: true });
        const worksite = await prisma.worksite.create({
          data: { name: 'Otra obra QA' },
        });
        const other = await prisma.customerWorksite.create({
          data: { customerId: site.customerId, worksiteId: worksite.id },
        });
        const menu = await send('Cambiar obra');
        const state = (await draft()).worksiteMenu;
        const row = (menu!.replyOptions as any).rows[
          state.choices.indexOf(other.id)
        ];
        await send('La otra', { selectionId: row.id });
        expect((await draft()).evidenceFileIds).toEqual([]);
        expect((await draft()).ready).toBe(false);
        await send('Cancelar');
        await prisma.customerWorksite.delete({ where: { id: other.id } });
        await prisma.worksite.delete({ where: { id: worksite.id } });
      });
      it('offers AI-ranked typo suggestions without recording and keeps a full-catalog fallback if AI is unavailable', async () => {
        const worksite = await prisma.worksite.create({
          data: { name: 'COLEGIO UNICAMACHO' },
        });
        const link = await prisma.customerWorksite.create({
          data: { customerId: site.customerId, worksiteId: worksite.id },
        });
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'CHECK_IN',
            worksiteReference: 'unicamaho',
            customerReference: 'Cliente QA',
          }),
        );
        const before = await prisma.whatsappReport.count();
        const suggested = await send('Entrada universidad unicamaho', {
          image: true,
        });
        expect(suggested?.replyKind).toBe('WORKSITE_MENU');
        expect(suggested?.replyText).toContain('nombres parecidos');
        expect(ai.suggestWorksites).toHaveBeenCalled();
        expect((await draft()).worksiteMenu.choices).toContain(link.id);
        expect(await prisma.whatsappReport.count()).toBe(before);
        const all = (suggested!.replyOptions as any).rows.find(
          (r: any) => r.title === 'Ver todas las obras',
        );
        const catalog = await send('Ver todas', { selectionId: all.id });
        expect(catalog?.replyText).toContain('No necesitas escribir');
        expect((await draft()).worksiteMenu.suggested).not.toBe(true);
        await send('Cancelar');
        ai.suggestWorksites.mockRejectedValueOnce(new Error('AI unavailable'));
        const fallback = await send('Entrada universidad unicamaho', {
          image: true,
        });
        expect(fallback?.replyKind).toBe('WORKSITE_MENU');
        expect((await draft()).worksiteMenu.choices).toContain(link.id);
        expect((await draft()).evidenceFileIds).toHaveLength(1);
        await send('Cancelar');
        await prisma.customerWorksite.delete({ where: { id: link.id } });
        await prisma.worksite.delete({ where: { id: worksite.id } });
      });
      it('pages all active worksite/customer links within the native ten-row limit', async () => {
        const sites: string[] = [];
        const links: string[] = [];
        for (let n = 0; n < 18; n++) {
          const s = await prisma.worksite.create({
            data: { name: `Obra paginada ${n}` },
          });
          sites.push(s.id);
          const l = await prisma.customerWorksite.create({
            data: {
              customerId: site.customerId,
              worksiteId: s.id,
              active: n !== 17,
            },
          });
          links.push(l.id);
        }
        const seen: string[] = [];
        for (let page = 0; page < 10; page++) {
          const picker = await worksitePicker(prisma, page);
          seen.push(...picker.state.choices);
          const rows = (picker.options as any).rows;
          expect(rows.length).toBeLessThanOrEqual(10);
          expect(
            rows.every(
              (r: any) => r.title.length <= 24 && r.description.length <= 72,
            ),
          ).toBe(true);
          if (!rows.some((r: any) => r.title === 'Más obras →')) break;
        }
        const active = await prisma.customerWorksite.findMany({
          where: {
            active: true,
            customer: { active: true },
            worksite: { active: true },
          },
          select: { id: true },
        });
        expect(seen.sort()).toEqual(active.map((s) => s.id).sort());
        expect(new Set(seen).size).toBe(seen.length);
        await prisma.customerWorksite.deleteMany({
          where: { id: { in: links } },
        });
        await prisma.worksite.deleteMany({ where: { id: { in: sites } } });
      });
    });

    describe('AI equipment search, readable names and optional photos', () => {
      const phone = '573001234567';
      const current = () =>
        prisma.whatsappConversation.findUniqueOrThrow({ where: { phone } });
      let machine: any;
      const technicalCode =
        'CUT-20260729-BODEGA_PRINCIPAL_D-CORTADORA_DE_CONCR-ESTANDAR-CORTADORA_DE_CONCR-001-58145BC8';
      beforeAll(async () => {
        machine = await prisma.asset.create({
          data: {
            skuId: asset.skuId,
            warehouseOwnerId: asset.warehouseOwnerId,
            publicCode: technicalCode,
            internalNumber: 73,
            brand: 'CASE',
            model: 'SR240B',
            description: 'Minicargador amarillo',
          },
        });
      });
      beforeEach(async () => {
        await send('Cancelar');
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { lastEquipment: Prisma.DbNull },
        });
        cloud.photo.mockClear();
        ai.extract.mockClear();
        ai.equipmentSearchTerms.mockClear();
      });
      it('starts with a search prompt, finds matching machines with AI and remembers a tapped machine even after cancelling', async () => {
        const prompt = await send('Daño', { selectionId: 'report_damage' });
        expect(prompt?.replyText).toContain(
          'Escribe su nombre, marca o modelo',
        );
        expect(prompt?.replyText).not.toContain('Página');
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'DAMAGE',
            subjectReference: 'minicargador case',
            description: 'Fuga de aceite',
          }),
        );
        const matches = await send(
          'El minicargador Case tiene una fuga de aceite',
        );
        expect(ai.equipmentSearchTerms).toHaveBeenCalled();
        expect(matches?.replyText).toContain('Ver coincidencias');
        const draft = (await current()).draft as any;
        const index = draft.equipmentMenu.choices.findIndex(
          (ref: any) => ref.id === machine.id,
        );
        expect(index).toBeGreaterThanOrEqual(0);
        const rows = (matches!.replyOptions as any).rows;
        expect(rows.length).toBeLessThanOrEqual(10);
        expect(
          JSON.stringify(
            rows.map((r: any) => ({
              title: r.title,
              description: r.description,
            })),
          ),
        ).not.toContain(technicalCode);
        const picked = await send('Esta máquina', {
          selectionId: rows[index].id,
        });
        expect(picked?.replyText).not.toContain(technicalCode);
        expect(picked?.replyKind).toBe('CONFIRMATION');
        expect((await current()).lastEquipment).toEqual({
          type: 'ASSET',
          id: machine.id,
        });
        await send('Cancelar');
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { expiresAt: new Date(0) },
        });
        ai.extract.mockClear();
        ai.equipmentSearchTerms.mockClear();
        const recent = await send('Daño', { selectionId: 'report_damage' });
        expect(recent?.replyText).toContain('#73');
        expect(recent?.replyText).not.toContain(technicalCode);
        expect(
          (recent!.replyOptions as any).buttons.map((b: any) => b.title),
        ).toEqual(['Usar esta máquina', 'Buscar otra', 'Ver lista completa']);
        expect(ai.extract).not.toHaveBeenCalled();
        expect(ai.equipmentSearchTerms).not.toHaveBeenCalled();
      });
      it('keeps a photo sent while searching and stores it on the explicitly selected machine', async () => {
        await send('Daño', { selectionId: 'report_damage' });
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'DAMAGE',
            subjectReference: 'minicargador case',
            description: 'Se apaga el motor',
          }),
        );
        const matches = await send('El minicargador Case se apaga', {
          image: true,
        });
        expect(matches?.replyText).toContain('Foto recibida');
        const before = (await current()).draft as any;
        expect(before.evidenceFileIds).toHaveLength(1);
        const index = before.equipmentMenu.choices.findIndex(
          (ref: any) => ref.id === machine.id,
        );
        const summary = await send('Esta', {
          selectionId: (matches!.replyOptions as any).rows[index].id,
        });
        expect(summary?.replyKind).toBe('CONFIRMATION');
        expect((await current()).draft).toMatchObject({
          evidenceFileIds: before.evidenceFileIds,
        });
        const done = await send('Sí', {
          selectionId: `report_confirm:${summary!.id}`,
        });
        const report = await prisma.whatsappReport.findUniqueOrThrow({
          where: { sourceMessageId: done!.providerMessageId },
          include: { evidence: true },
        });
        expect(report.assetId).toBe(machine.id);
        expect(report.evidence.map((e) => e.fileObjectId)).toEqual(
          before.evidenceFileIds,
        );
      });
      it('offers Add photos, acknowledges the image and does not let image guesses change the selected machine', async () => {
        await prisma.whatsappConversation.update({
          where: { phone },
          data: { lastEquipment: { type: 'ASSET', id: machine.id } },
        });
        const recent = await send('Daño', { selectionId: 'report_damage' });
        await send('Usar esta máquina', {
          selectionId: (recent!.replyOptions as any).buttons[0].id,
        });
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'DAMAGE',
            subjectReference: `${asset.sku?.name ?? 'Retroexcavadora QA'} #73`,
            description: 'Consumo de aceite',
          }),
        );
        const summary = await send('Consumo de aceite');
        expect(summary?.replyKind).toBe('CONFIRMATION');
        const help = await send('Agregar fotos', {
          selectionId: `report_photo:${summary!.id}`,
        });
        expect(help?.replyText).toContain('Fotos/Galería');
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'HOUR_METER',
            subjectReference: 'Otra máquina',
            description: 'Consumo de aceite',
          }),
        );
        const photo = await send('', { image: true });
        expect(photo?.replyText).toContain('Foto recibida. Fotos adjuntas: 1');
        expect(photo?.replyText).not.toContain(technicalCode);
        expect((await current()).draft).toMatchObject({
          kind: 'DAMAGE',
          selectedEquipment: { type: 'ASSET', id: machine.id },
        });
        const old = await send('Sí', {
          selectionId: `report_confirm:${summary!.id}`,
        });
        expect(old?.replyText).toContain('resumen anterior');
        const done = await send('Sí', {
          selectionId: `report_confirm:${photo!.id}`,
        });
        const report = await prisma.whatsappReport.findUniqueOrThrow({
          where: { sourceMessageId: done!.providerMessageId },
          include: { evidence: true },
        });
        expect(report.assetId).toBe(machine.id);
        expect(report.evidence).toHaveLength(1);
        const transport = {
          sendWhatsapp: jest.fn(async () => ({
            sent: true,
            providerMessageId: `qa-alert-${randomUUID()}`,
          })),
        };
        await new WhatsappReportAlertsService(prisma, transport as any).tick();
        const calls = transport.sendWhatsapp.mock.calls as any[];
        expect(calls.some((call) => call[1].body.includes('#73'))).toBe(true);
        expect(
          calls.every((call) => !call[1].body.includes(technicalCode)),
        ).toBe(true);
      });
      it('falls back to nearby matches when AI is down and keeps the catalog optional', async () => {
        await send('Daño', { selectionId: 'report_damage' });
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'DAMAGE',
            subjectReference: 'minicargadr case',
            description: 'Fuga',
          }),
        );
        ai.equipmentSearchTerms.mockRejectedValueOnce(new Error('AI down'));
        const fallback = await send('Minicargadr Case');
        expect(fallback?.replyKind).toBe('EQUIPMENT_MENU');
        const draft = (await current()).draft as any;
        expect(
          draft.equipmentMenu.choices.some((ref: any) => ref.id === machine.id),
        ).toBe(true);
        const catalog = (fallback!.replyOptions as any).rows.find(
          (r: any) => r.title === 'Ver lista completa',
        );
        const list = await send('Catálogo', { selectionId: catalog.id });
        expect(list?.replyText).toContain('Página');
      });
      it('rejects inactive or stale suggested machines and never turns an unchosen AI suggestion into memory', async () => {
        await send('Daño', { selectionId: 'report_damage' });
        ai.extract.mockResolvedValue(
          extracted({
            kind: 'DAMAGE',
            subjectReference: 'minicargador case',
            description: 'Fuga',
          }),
        );
        const matches = await send('Minicargador Case');
        const state = (await current()).draft as any;
        const index = state.equipmentMenu.choices.findIndex(
          (ref: any) => ref.id === machine.id,
        );
        expect((await current()).lastEquipment).toBeNull();
        await prisma.asset.update({
          where: { id: machine.id },
          data: { active: false },
        });
        await send('Esta', {
          selectionId: (matches!.replyOptions as any).rows[index].id,
        });
        expect((await current()).lastEquipment).toBeNull();
        expect((await current()).draft).not.toHaveProperty('selectedEquipment');
        await prisma.asset.update({
          where: { id: machine.id },
          data: { active: true },
        });
        await send('Cancelar');
        const stale = await send('Esta', {
          selectionId: (matches!.replyOptions as any).rows[index].id,
        });
        expect(stale?.replyKind).toBe('REPORT_MENU');
      });
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
