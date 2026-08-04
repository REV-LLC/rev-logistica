import { NotificationChannel } from '@prisma/client';
import { NOTIFICATION_ENTITY, NOTIFICATION_EVENT } from './notification.constants';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const settings = {
    get: jest.fn((key: string) => Promise.resolve({
      'tasks.due_warning_hours': 24,
      'tasks.overdue_repeat_enabled': true,
      'tasks.overdue_repeat_interval_hours': 24,
    }[key])),
  };
  it('automatically creates the mandatory SOAT and technical inspection topics', async () => {
    const upsert = jest.fn()
      .mockResolvedValueOnce({ id: 'soat-topic' })
      .mockResolvedValueOnce({ id: 'tech-topic' });
    const prisma = { notificationTopic: { upsert } };
    const service = new NotificationsService(prisma as any, {} as any, settings as any);

    const topics = await service.ensureVehicleTopics('vehicle-1');

    expect(topics).toHaveLength(2);
    expect(upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { entityType_entityId_eventType: {
        entityType: NOTIFICATION_ENTITY.VEHICLE,
        entityId: 'vehicle-1',
        eventType: NOTIFICATION_EVENT.SOAT_EXPIRY,
      } },
    }));
    expect(upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { entityType_entityId_eventType: expect.objectContaining({
        eventType: NOTIFICATION_EVENT.TECH_INSPECTION_EXPIRY,
      }) },
    }));
  });

  it('returns only the authenticated user topics and calculates an overdue vehicle document', async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const topic = {
      id: 'topic-1', entityType: 'VEHICLE', entityId: 'vehicle-1', eventType: 'SOAT_EXPIRY',
      recipients: [{
        userId: 'user-1', emailEnabled: true, smsEnabled: false,
        user: { email: 'ana@example.com', employee: { name: 'Ana', lastName: 'Ruiz', phone: null } },
      }],
    };
    const topicFindMany = jest.fn().mockResolvedValue([topic]);
    const prisma = {
      notificationTopic: { findMany: topicFindMany },
      vehicle: { findMany: jest.fn().mockResolvedValue([{ id: 'vehicle-1', plate: 'ABC123', active: true, soatVigencia: yesterday }]) },
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new NotificationsService(prisma as any, {} as any, settings as any);

    const reminders = await service.listReminders('user-1');

    expect(topicFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ recipients: { some: { userId: 'user-1', user: { active: true } } } }),
    }));
    expect(reminders[0]).toMatchObject({
      topicId: 'topic-1', title: 'SOAT de ABC123', status: 'OVERDUE', unit: 'DAYS',
      entity: { id: 'vehicle-1', type: 'VEHICLE', label: 'ABC123' },
    });
  });

  it('returns unassigned topics in the global inbox', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const topicFindMany = jest.fn().mockResolvedValue([{
      id: 'topic-global',
      entityType: 'VEHICLE',
      entityId: 'vehicle-global',
      eventType: 'SOAT_EXPIRY',
      recipients: [],
    }]);
    const prisma = {
      notificationTopic: { findMany: topicFindMany },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'vehicle-global',
          plate: 'GLOBAL1',
          active: true,
          soatVigencia: tomorrow,
        }]),
      },
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new NotificationsService(prisma as any, {} as any, settings as any);

    const reminders = await service.listReminders();

    expect(topicFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true },
    }));
    expect(reminders[0]).toMatchObject({
      topicId: 'topic-global',
      unit: 'DAYS',
      entity: { id: 'vehicle-global', type: 'VEHICLE', label: 'GLOBAL1' },
      recipients: [],
    });
  });

  it('uses the same personal inbox for vehicle maintenance by hours', async () => {
    const topic = {
      id: 'topic-maintenance', entityType: 'MAINTENANCE_ITEM', entityId: 'item-1', eventType: 'MAINTENANCE_DUE',
      recipients: [{
        userId: 'user-1', emailEnabled: true, smsEnabled: true,
        user: { email: 'ana@example.com', employee: { name: 'Ana', lastName: 'Ruiz', phone: '+573001234567' } },
      }],
    };
    const item = {
      id: 'item-1', planId: 'plan-1', name: 'CAMBIO DE ACEITE', instructions: 'CAMBIAR FILTRO',
      intervalHours: 100, warningHours: 10, baselineHours: 0,
      completions: [{ completedAtHours: 150 }],
      plan: {
        name: 'MOTOR', asset: null,
        vehicle: { id: 'vehicle-1', plate: 'ABC123', hourReadings: [{ hours: 255 }] },
      },
    };
    const prisma = {
      notificationTopic: { findMany: jest.fn().mockResolvedValue([topic]) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([item]) },
    };
    const service = new NotificationsService(prisma as any, {} as any, settings as any);

    const reminders = await service.listReminders('user-1');

    expect(reminders[0]).toMatchObject({
      topicId: 'topic-maintenance', status: 'OVERDUE', unit: 'HOURS',
      currentHours: 255, dueHours: 250, remainingHours: -5,
      entity: { id: 'vehicle-1', type: 'VEHICLE', label: 'ABC123' },
    });
  });

  it('dispatches alerts only through WhatsApp', async () => {
    const service = new NotificationsService({} as any, {} as any, settings as any);
    jest.spyOn(service, 'listReminders').mockResolvedValue([{
      topicId: 'topic-1',
      status: 'DUE',
      recipients: [{
        userId: 'user-1',
        email: 'ana@example.com',
        phone: '+573001234567',
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: true,
      }],
    }] as any);
    const dispatchOne = jest.spyOn(service as any, 'dispatchOne').mockResolvedValue('sent');

    await expect(service.dispatchNotifications()).resolves.toEqual({
      reminders: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    expect(dispatchOne).toHaveBeenCalledTimes(1);
    expect(dispatchOne).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      NotificationChannel.WHATSAPP,
    );
    expect(dispatchOne).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      NotificationChannel.EMAIL,
    );
    expect(dispatchOne).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      NotificationChannel.SMS,
    );
  });

  it('marks an assigned task due using the warning hours stored in settings', async () => {
    const dueDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const topic = {
      id: 'topic-task', entityType: 'TASK', entityId: 'task-1', eventType: 'TASK_DUE',
      recipients: [{
        userId: 'user-1', emailEnabled: false, smsEnabled: false, whatsappEnabled: true,
        user: { email: 'hector@example.com', employee: { name: 'Héctor', lastName: 'Ruiz', phone: '+573001234567' } },
      }],
    };
    const prisma = {
      notificationTopic: { findMany: jest.fn().mockResolvedValue([topic]) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([{ id: 'task-1', title: 'Revisar equipo', dueDate, status: 'OPEN' }]) },
    };
    const service = new NotificationsService(prisma as any, {} as any, settings as any);

    await expect(service.listReminders('user-1')).resolves.toEqual([
      expect.objectContaining({
        topicId: 'topic-task', status: 'DUE', unit: 'HOURS',
        entity: { id: 'task-1', type: 'TASK', label: 'Revisar equipo' },
      }),
    ]);
  });

  it('calculates daily asset maintenance from calendar dates', async () => {
    const baselineDate = new Date();
    baselineDate.setUTCHours(0, 0, 0, 0);
    baselineDate.setUTCDate(baselineDate.getUTCDate() - 25);
    const topic = {
      id: 'topic-calendar', entityType: 'MAINTENANCE_ITEM', entityId: 'item-day', eventType: 'MAINTENANCE_DUE',
      recipients: [{
        userId: 'user-1', emailEnabled: true, smsEnabled: false,
        user: { email: 'ana@example.com', employee: { name: 'Ana', lastName: 'Ruiz', phone: null } },
      }],
    };
    const item = {
      id: 'item-day', planId: 'plan-day', name: 'INSPECCIÓN GENERAL', instructions: null,
      intervalHours: null, warningHours: null, baselineHours: null,
      intervalDays: 30, warningDays: 7, baselineDate, createdAt: baselineDate,
      completions: [],
      plan: {
        name: 'CALENDARIO', vehicle: null,
        asset: {
          id: 'asset-1', publicCode: 'EQ-001', hourMeter: 0,
          serialOrEngine: 'SERIE-1', description: 'Equipo diario',
          sku: { chargeType: 'DAY' },
        },
      },
    };
    const prisma = {
      notificationTopic: { findMany: jest.fn().mockResolvedValue([topic]) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      maintenanceItem: { findMany: jest.fn().mockResolvedValue([item]) },
    };
    const service = new NotificationsService(prisma as any, {} as any, settings as any);

    const reminders = await service.listReminders('user-1');

    expect(reminders[0]).toMatchObject({
      topicId: 'topic-calendar',
      status: 'DUE',
      unit: 'DAYS',
      intervalDays: 30,
      remainingDays: 5,
      entity: { id: 'asset-1', type: 'ASSET', label: 'EQ-001' },
    });
  });
});
