import { NotificationDeliveryStatus, Role } from '@prisma/client';
import { hourMeterReminderOccurrence } from './hour-meter-reminder';
import { NotificationsService } from './notifications.service';

describe('Daily operator hour-meter WhatsApp reminder', () => {
  const originalEnv = { ...process.env };
  const due = new Date('2026-09-11T22:00:00Z'); // 17:00 Colombia

  beforeEach(() => {
    process.env.HOUR_METER_REMINDER_ENABLED = 'true';
    process.env.HOUR_METER_REMINDER_TIME = '17:00';
    process.env.HOUR_METER_REMINDER_TIME_ZONE = 'America/Bogota';
    process.env.PUBLIC_WEB_URL = 'https://app.example.test/';
    delete process.env.HOUR_METER_REMINDER_APP_NAME;
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  function setup() {
    const deliveries = new Map<string, any>();
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'operator-1', employee: { name: 'Ana', lastName: 'Pérez', phone: '+57 300 123 4567' } },
        ]),
      },
      notificationTopic: { upsert: jest.fn().mockResolvedValue({ id: 'daily-topic', active: true }) },
      notificationDelivery: {
        findUnique: jest.fn(async ({ where }) => deliveries.get(JSON.stringify(where.topicId_userId_occurrenceKey_channel)) ?? null),
        upsert: jest.fn(async ({ create }) => {
          const id = JSON.stringify(create);
          if (!deliveries.has(id)) deliveries.set(id, { id, ...create, status: 'PENDING', updatedAt: due });
          return deliveries.get(id);
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const row = deliveries.get(where.id);
          if (!row || !where.status.in?.includes(row.status)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
        update: jest.fn(async ({ where, data }) => Object.assign(deliveries.get(where.id), data)),
      },
    };
    const transport = { sendWhatsapp: jest.fn().mockResolvedValue({ sent: true, providerMessageId: 'meta-1' }) };
    const service = new NotificationsService(prisma as any, transport as any, {} as any);
    return { service, prisma, transport, deliveries };
  }

  it('uses Colombian date and does not send before the configured time', () => {
    expect(hourMeterReminderOccurrence(new Date('2026-09-11T21:59:59Z'))).toBeNull();
    expect(hourMeterReminderOccurrence(due)).toBe('daily:2026-09-11');
    expect(hourMeterReminderOccurrence(new Date('2026-09-12T01:00:00Z'))).toBe('daily:2026-09-11');
    expect(hourMeterReminderOccurrence(new Date('2026-09-12T05:00:00Z'))).toBeNull();
    expect(hourMeterReminderOccurrence(new Date('2026-09-12T22:00:00Z'))).toBe('daily:2026-09-12');
  });

  it('supports midnight and other company time zones', () => {
    process.env.HOUR_METER_REMINDER_TIME = '00:00';
    expect(hourMeterReminderOccurrence(new Date('2026-09-12T05:00:00Z'))).toBe('daily:2026-09-12');
    process.env.HOUR_METER_REMINDER_TIME_ZONE = 'Asia/Tokyo';
    expect(hourMeterReminderOccurrence(due)).toBe('daily:2026-09-12');
  });

  it('does no database work when disabled or not due', async () => {
    const { service, prisma } = setup();
    await service.dispatchHourMeterReminders(new Date('2026-09-11T21:59:59Z'));
    process.env.HOUR_METER_REMINDER_ENABLED = 'false';
    await service.dispatchHourMeterReminders(due);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it.each(['25:00', '17:60', '5pm'])('rejects invalid schedule %s without sending', (time) => {
    process.env.HOUR_METER_REMINDER_TIME = time;
    expect(() => hourMeterReminderOccurrence(due)).toThrow('HH:mm');
  });

  it('does not send with an invalid timezone', () => {
    process.env.HOUR_METER_REMINDER_TIME_ZONE = 'invalid/timezone';
    expect(() => hourMeterReminderOccurrence(due)).toThrow();
  });

  it('requires a public origin instead of sending a broken relative link', async () => {
    const { service, transport } = setup();
    delete process.env.PUBLIC_WEB_URL;
    await expect(service.dispatchHourMeterReminders(due)).rejects.toThrow('PUBLIC_WEB_URL');
    expect(transport.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('selects only active OPERATOR users with active employees and phones; sends Spanish text and the correct link', async () => {
    const { service, prisma, transport } = setup();
    await expect(service.dispatchHourMeterReminders(due)).resolves.toEqual({ reminders: 1, sent: 1, skipped: 0, failed: 0 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, role: Role.OPERATOR, employee: { is: { active: true, phone: { not: null } } } },
    }));
    expect(transport.sendWhatsapp).toHaveBeenCalledWith('573001234567', {
      title: 'Recordatorio diario de horómetros',
      body: '¿Ya registraste el horómetro de hoy en REV Logística? Si aún no lo has hecho, ingresa a la página de horómetros y registra la lectura de tu equipo.',
      link: 'https://app.example.test/inventory/hour-meter',
      recipientName: 'Ana Pérez',
    });
  });

  it.each(['SENT', 'ACCEPTED', 'DELIVERED', 'READ'] as NotificationDeliveryStatus[])(
    'does not resend a %s delivery on the same local date, including after service restart', async (status) => {
      const { service, prisma, transport, deliveries } = setup();
      await service.dispatchHourMeterReminders(due);
      for (const delivery of deliveries.values()) delivery.status = status;
      const restarted = new NotificationsService(prisma as any, transport as any, {} as any);
      await restarted.dispatchHourMeterReminders(new Date('2026-09-12T01:00:00Z'));
      expect(transport.sendWhatsapp).toHaveBeenCalledTimes(1);
      await restarted.dispatchHourMeterReminders(new Date('2026-09-12T22:00:00Z'));
      expect(transport.sendWhatsapp).toHaveBeenCalledTimes(2);
    },
  );

  it('claims a delivery only once when concurrent workers process the same day', async () => {
    const { service, transport } = setup();
    await Promise.all([service.dispatchHourMeterReminders(due), service.dispatchHourMeterReminders(due)]);
    expect(transport.sendWhatsapp).toHaveBeenCalledTimes(1);
  });

  it('retries a failed send and preserves its delivery identity', async () => {
    const { service, transport, deliveries } = setup();
    transport.sendWhatsapp.mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(service.dispatchHourMeterReminders(due)).resolves.toEqual({ reminders: 1, sent: 0, skipped: 0, failed: 1 });
    await expect(service.dispatchHourMeterReminders(due)).resolves.toEqual({ reminders: 1, sent: 1, skipped: 0, failed: 0 });
    expect(deliveries.size).toBe(1);
  });

  it('skips missing or malformed phones', async () => {
    const { service, prisma, transport } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'operator-1', employee: { name: 'Ana', lastName: 'Pérez', phone: '   ' } },
    ]);
    await expect(service.dispatchHourMeterReminders(due)).resolves.toEqual({ reminders: 0, sent: 0, skipped: 1, failed: 0 });
    expect(transport.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('supports company branding and no recipients', async () => {
    const { service, prisma, transport } = setup();
    process.env.HOUR_METER_REMINDER_APP_NAME = 'Otra empresa';
    await service.dispatchHourMeterReminders(due);
    expect(transport.sendWhatsapp.mock.calls[0][1].body).toContain('en Otra empresa?');
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.dispatchHourMeterReminders(due)).resolves.toEqual({ reminders: 0, sent: 0, skipped: 0, failed: 0 });
  });
});
