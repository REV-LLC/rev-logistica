import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigureNotificationTopicDto, NotificationRecipientDto } from './dto/notification.dto';
import { NOTIFICATION_ENTITY, NOTIFICATION_EVENT, VEHICLE_REQUIRED_EVENTS } from './notification.constants';
import { NotificationMessage, NotificationTransportService } from './notification-transport.service';
import { SettingsService } from '../settings/settings.service';

type DbClient = PrismaService | Prisma.TransactionClient;
type ReminderStatus = 'UPCOMING' | 'DUE' | 'OVERDUE';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transport: NotificationTransportService,
    private readonly settings: SettingsService,
  ) {}

  async syncTaskNotification(taskId: string, reason: 'CREATED' | 'REASSIGNED' | 'DUE_DATE_CHANGED' | 'UPDATED') {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedTo: { include: { employee: true } },
        assignedToEmployee: { include: { user: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    const candidateUser = task.assignedTo ?? task.assignedToEmployee?.user ?? null;
    const user = candidateUser?.active ? candidateUser : null;
    const topicKey = { entityType: NOTIFICATION_ENTITY.TASK, entityId: task.id, eventType: NOTIFICATION_EVENT.TASK_DUE };
    const topic = await this.prisma.notificationTopic.upsert({
      where: { entityType_entityId_eventType: topicKey },
      create: { ...topicKey, active: task.status !== 'DONE' && Boolean(user) },
      update: { active: task.status !== 'DONE' && Boolean(user) },
    });
    await this.replaceRecipients(topic.id, user ? [{ userId: user.id, whatsappEnabled: true }] : [], this.prisma);
    if (task.status === 'DONE') return { sent: 0, skipped: 1 };

    const shouldNotify = reason === 'CREATED' || reason === 'REASSIGNED'
      ? await this.settings.get<boolean>('tasks.notify_on_assignment')
      : reason === 'DUE_DATE_CHANGED'
        ? await this.settings.get<boolean>('tasks.notify_on_due_date_change') : false;
    if (!shouldNotify) return { sent: 0, skipped: 1 };

    if (!user) {
      const employee = task.assignedToEmployee;
      if (!employee?.active || !employee.phone) return { sent: 0, skipped: 1 };
      const isDueChange = reason === 'DUE_DATE_CHANGED';
      try {
        const response = await this.transport.sendWhatsapp(employee.phone, {
          title: isDueChange ? `Nueva fecha para: ${task.title}` : `Nueva tarea: ${task.title}`,
          body: `${isDueChange ? 'Se actualizó la fecha de esta tarea' : 'Te asignaron esta tarea'}${task.dueDate ? `; vence el ${this.formatDate(task.dueDate)}` : ''}.`,
          recipientName: `${employee.name} ${employee.lastName}`.trim(),
          link: this.appLink('/tasks'),
        });
        return { sent: response.sent ? 1 : 0, skipped: response.sent ? 0 : 1 };
      } catch {
        return { sent: 0, skipped: 0, failed: 1 };
      }
    }

    const hydrated = await this.prisma.notificationTopic.findUniqueOrThrow({
      where: { id: topic.id }, include: this.topicRecipientsInclude(),
    });
    const recipient = this.mapRecipients(hydrated.recipients)[0];
    if (!recipient?.phone) return { sent: 0, skipped: 1 };
    const isDueChange = reason === 'DUE_DATE_CHANGED';
    const reminder = {
      topicId: topic.id,
      occurrenceKey: `${isDueChange ? 'due-change' : 'assignment'}:${task.updatedAt.toISOString()}`,
      title: isDueChange ? `Nueva fecha para: ${task.title}` : `Nueva tarea: ${task.title}`,
      message: `${isDueChange ? 'Se actualizó la fecha de esta tarea' : 'Te asignaron esta tarea'}${task.dueDate ? `; vence el ${this.formatDate(task.dueDate)}` : ''}.`,
      link: this.appLink('/tasks'),
    };
    const result = await this.dispatchOne(reminder, recipient, NotificationChannel.WHATSAPP);
    return { sent: result === 'sent' ? 1 : 0, skipped: result === 'skipped' ? 1 : 0, failed: result === 'failed' ? 1 : 0 };
  }

  async ensureVehicleTopics(vehicleId: string, recipients?: NotificationRecipientDto[], db: DbClient = this.prisma) {
    const topics: Array<{ id: string }> = [];
    for (const eventType of VEHICLE_REQUIRED_EVENTS) {
      topics.push(await db.notificationTopic.upsert({
        where: { entityType_entityId_eventType: { entityType: NOTIFICATION_ENTITY.VEHICLE, entityId: vehicleId, eventType } },
        create: { entityType: NOTIFICATION_ENTITY.VEHICLE, entityId: vehicleId, eventType },
        update: { active: true },
      }));
    }
    if (recipients) {
      await this.assertRecipients(recipients, db);
      for (const topic of topics) await this.replaceRecipients(topic.id, recipients, db);
    }
    return topics;
  }

  async ensureMaintenanceTopic(itemId: string, recipients: NotificationRecipientDto[], db: DbClient = this.prisma) {
    await this.assertRecipients(recipients, db);
    const topic = await db.notificationTopic.upsert({
      where: {
        entityType_entityId_eventType: {
          entityType: NOTIFICATION_ENTITY.MAINTENANCE_ITEM,
          entityId: itemId,
          eventType: NOTIFICATION_EVENT.MAINTENANCE_DUE,
        },
      },
      create: {
        entityType: NOTIFICATION_ENTITY.MAINTENANCE_ITEM,
        entityId: itemId,
        eventType: NOTIFICATION_EVENT.MAINTENANCE_DUE,
      },
      update: { active: true },
    });
    await this.replaceRecipients(topic.id, recipients, db);
    return topic;
  }

  async setRecipients(topicId: string, recipients: NotificationRecipientDto[]) {
    await this.assertTopic(topicId);
    await this.assertRecipients(recipients, this.prisma);
    return this.prisma.$transaction(async (tx) => {
      await this.replaceRecipients(topicId, recipients, tx);
      return tx.notificationTopic.findUnique({ where: { id: topicId }, include: this.topicRecipientsInclude() });
    });
  }

  async configureDateTopic(entityType: string, entityId: string, payload: ConfigureNotificationTopicDto) {
    entityType = entityType.trim().toUpperCase();
    if (
      entityType === NOTIFICATION_ENTITY.VEHICLE &&
      (VEHICLE_REQUIRED_EVENTS as readonly string[]).includes(payload.eventType)
    ) {
      throw new BadRequestException('Mandatory vehicle topics only allow recipient changes');
    }
    await this.assertRecipients(payload.recipients, this.prisma);
    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.notificationTopic.upsert({
        where: { entityType_entityId_eventType: { entityType, entityId, eventType: payload.eventType } },
        create: {
          entityType, entityId, eventType: payload.eventType,
          titleTemplate: payload.titleTemplate.trim(), messageTemplate: payload.messageTemplate.trim(),
          dueAt: new Date(payload.dueAt), warningDays: payload.warningDays ?? 30, active: payload.active ?? true,
        },
        update: {
          titleTemplate: payload.titleTemplate.trim(), messageTemplate: payload.messageTemplate.trim(),
          dueAt: new Date(payload.dueAt), warningDays: payload.warningDays ?? 30, active: payload.active ?? true,
        },
      });
      await this.replaceRecipients(topic.id, payload.recipients, tx);
      return tx.notificationTopic.findUnique({ where: { id: topic.id }, include: this.topicRecipientsInclude() });
    });
  }

  async getEntityTopics(entityType: string, entityId: string) {
    entityType = entityType.trim().toUpperCase();
    if (entityType === NOTIFICATION_ENTITY.VEHICLE) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: entityId }, select: { id: true } });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
      await this.ensureVehicleTopics(entityId);
    }
    return this.prisma.notificationTopic.findMany({
      where: { entityType, entityId, active: true },
      orderBy: { eventType: 'asc' },
      include: this.topicRecipientsInclude(),
    });
  }

  async listReminders(userId?: string) {
    const topics = await this.prisma.notificationTopic.findMany({
      where: {
        active: true,
        ...(userId ? {
          recipients: { some: { userId, user: { active: true } } },
        } : {}),
      },
      include: {
        recipients: {
          where: userId ? { userId } : { user: { active: true } },
          include: { user: { include: { employee: true } } },
        },
      },
    });
    const vehicleTopics = topics.filter((topic) => topic.entityType === NOTIFICATION_ENTITY.VEHICLE);
    const maintenanceTopics = topics.filter((topic) => topic.entityType === NOTIFICATION_ENTITY.MAINTENANCE_ITEM);
    const taskTopics = topics.filter((topic) => topic.entityType === NOTIFICATION_ENTITY.TASK);
    const genericTopics = topics.filter((topic) =>
      topic.entityType !== NOTIFICATION_ENTITY.VEHICLE
      && topic.entityType !== NOTIFICATION_ENTITY.MAINTENANCE_ITEM
      && topic.entityType !== NOTIFICATION_ENTITY.TASK,
    );
    const [vehicles, items, tasks, dueWarningHours, overdueRepeatEnabled, overdueRepeatIntervalHours] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { id: { in: vehicleTopics.map((topic) => topic.entityId) }, active: true },
      }),
      this.prisma.maintenanceItem.findMany({
        where: {
          id: { in: maintenanceTopics.map((topic) => topic.entityId) }, active: true,
          plan: { active: true, OR: [{ asset: { active: true } }, { vehicle: { active: true } }] },
        },
        include: {
          plan: {
            include: {
              asset: { include: { sku: { select: { chargeType: true } } } },
              vehicle: { include: { hourReadings: { orderBy: { hours: 'desc' }, take: 1 } } },
            },
          },
          completions: { orderBy: { completedAt: 'desc' }, take: 1 },
        },
      }),
      taskTopics.length ? this.prisma.task.findMany({
        where: { id: { in: taskTopics.map((topic) => topic.entityId) }, status: { not: 'DONE' } },
      }) : Promise.resolve([]),
      this.settings.get<number>('tasks.due_warning_hours'),
      this.settings.get<boolean>('tasks.overdue_repeat_enabled'),
      this.settings.get<number>('tasks.overdue_repeat_interval_hours'),
    ]);
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const itemById = new Map(items.map((item) => [item.id, item]));
    const taskById = new Map(tasks.map((task) => [task.id, task] as const));
    const reminders: any[] = topics.flatMap<any>((topic) => {
      if (topic.entityType === NOTIFICATION_ENTITY.VEHICLE) {
        const vehicle = vehicleById.get(topic.entityId);
        return vehicle ? this.vehicleReminder(topic, vehicle) : [];
      }
      if (topic.entityType === NOTIFICATION_ENTITY.MAINTENANCE_ITEM) {
        const item = itemById.get(topic.entityId);
        return item ? [this.maintenanceReminder(topic, item)] : [];
      }
      if (topic.entityType === NOTIFICATION_ENTITY.TASK) {
        const task = taskById.get(topic.entityId);
        return task ? [this.taskReminder(topic, task, dueWarningHours, overdueRepeatEnabled, overdueRepeatIntervalHours)] : [];
      }
      if (genericTopics.some((candidate) => candidate.id === topic.id)) {
        return topic.dueAt ? [this.genericDateReminder(topic)] : [];
      }
      return [];
    });
    return reminders.sort((a, b) => a.sortValue - b.sortValue);
  }

  private taskReminder(topic: any, task: any, warningHours: number, repeatEnabled: boolean, repeatHours: number) {
    const dueAt = task.dueDate as Date | null;
    const remainingHours = dueAt ? (dueAt.getTime() - Date.now()) / 3_600_000 : Number.POSITIVE_INFINITY;
    const status: ReminderStatus = remainingHours < 0 ? 'OVERDUE' : remainingHours <= warningHours ? 'DUE' : 'UPCOMING';
    const overdueBucket = dueAt && status === 'OVERDUE'
      ? Math.floor(Math.max(0, -remainingHours) / Math.max(1, repeatHours)) : 0;
    return {
      topicId: topic.id, entityType: topic.entityType, entityId: task.id, eventType: topic.eventType,
      title: `Tarea: ${task.title}`,
      message: dueAt
        ? `${status === 'OVERDUE' ? 'La tarea está vencida' : `La tarea vence el ${this.formatDate(dueAt)}`}.`
        : 'Tarea asignada sin fecha de vencimiento.',
      link: this.appLink('/tasks'),
      status, dueAt, remainingHours, unit: 'HOURS', sortValue: remainingHours,
      occurrenceKey: status === 'OVERDUE'
        ? `overdue:${dueAt?.toISOString()}:${repeatEnabled ? overdueBucket : 'once'}`
        : `due:${dueAt?.toISOString() ?? 'none'}`,
      entity: { id: task.id, type: 'TASK', label: task.title },
      recipients: this.mapRecipients(topic.recipients),
    };
  }

  async dispatchNotifications() {
    const reminders = (await this.listReminders()).filter((reminder) => reminder.status !== 'UPCOMING');
    let sent = 0; let skipped = 0; let failed = 0;
    for (const reminder of reminders) {
      for (const recipient of reminder.recipients) {
        const channels: NotificationChannel[] = [];
        if (recipient.whatsappEnabled && recipient.phone) channels.push(NotificationChannel.WHATSAPP);
        for (const channel of channels) {
          const result = await this.dispatchOne(reminder, recipient, channel);
          if (result === 'sent') sent += 1;
          else if (result === 'failed') failed += 1;
          else skipped += 1;
        }
      }
    }
    return { reminders: reminders.length, sent, skipped, failed };
  }

  private vehicleReminder(topic: any, vehicle: any) {
    const isSoat = topic.eventType === NOTIFICATION_EVENT.SOAT_EXPIRY;
    const dueAt: Date | null = isSoat ? vehicle.soatVigencia : vehicle.tecnomecanicaVigencia;
    if (!dueAt) return [];
    const remainingDays = this.daysUntil(dueAt);
    const warningDays = this.vehicleWarningDays();
    const status: ReminderStatus = remainingDays < 0 ? 'OVERDUE' : remainingDays <= warningDays ? 'DUE' : 'UPCOMING';
    const documentName = isSoat ? 'SOAT' : 'TECNOMECÁNICA';
    return [{
      topicId: topic.id, entityType: topic.entityType, entityId: vehicle.id, eventType: topic.eventType,
      title: `${documentName} de ${vehicle.plate}`,
      message: `${documentName} del vehículo ${vehicle.plate} ${status === 'OVERDUE' ? 'está vencido' : `vence en ${remainingDays} días`}.`,
      status, dueAt, remainingDays, unit: 'DAYS', sortValue: remainingDays,
      occurrenceKey: dueAt.toISOString().slice(0, 10),
      entity: { id: vehicle.id, type: 'VEHICLE', label: vehicle.plate },
      recipients: this.mapRecipients(topic.recipients),
    }];
  }

  private maintenanceReminder(topic: any, item: any) {
    const subject = item.plan.asset ?? item.plan.vehicle;
    const label = item.plan.asset?.publicCode ?? item.plan.vehicle?.plate ?? 'EQUIPO';
    if (item.plan.asset?.sku.chargeType === 'DAY') {
      const cycleStart = item.completions[0]?.completedAt ?? item.baselineDate ?? item.createdAt;
      const dueAt = this.addCalendarDays(new Date(cycleStart), Number(item.intervalDays));
      const remainingDays = this.daysUntil(dueAt);
      const status: ReminderStatus = remainingDays < 0 ? 'OVERDUE'
        : remainingDays <= Number(item.warningDays) ? 'DUE' : 'UPCOMING';
      return {
        topicId: topic.id, entityType: topic.entityType, entityId: item.id, eventType: topic.eventType,
        itemId: item.id, planId: item.planId, planName: item.plan.name, name: item.name,
        title: `Mantenimiento de ${label}`,
        message: `${item.name}: vence el ${this.formatDate(dueAt)}.${item.instructions ? ` ${item.instructions}` : ''}`,
        instructions: item.instructions, intervalDays: Number(item.intervalDays), dueAt,
        remainingDays, unit: 'DAYS', status, sortValue: remainingDays,
        occurrenceKey: dueAt.toISOString().slice(0, 10),
        entity: { id: subject.id, type: 'ASSET', label },
        asset: {
          id: item.plan.asset.id, publicCode: item.plan.asset.publicCode,
          serialOrEngine: item.plan.asset.serialOrEngine, description: item.plan.asset.description,
        },
        recipients: this.mapRecipients(topic.recipients),
      };
    }

    const currentHours = item.plan.asset
      ? Number(item.plan.asset.hourMeter)
      : Number(item.plan.vehicle.hourReadings[0]?.hours ?? 0);
    const cycleStartHours = Number(item.completions[0]?.completedAtHours ?? item.baselineHours);
    const dueHours = cycleStartHours + Number(item.intervalHours);
    const remainingHours = dueHours - currentHours;
    const status: ReminderStatus = remainingHours <= 0 ? 'OVERDUE'
      : remainingHours <= Number(item.warningHours) ? 'DUE' : 'UPCOMING';
    return {
      topicId: topic.id, entityType: topic.entityType, entityId: item.id, eventType: topic.eventType,
      itemId: item.id, planId: item.planId, planName: item.plan.name, name: item.name,
      title: `Mantenimiento de ${label}`,
      message: `${item.name}: vence a las ${dueHours} h; horómetro actual ${currentHours} h.${item.instructions ? ` ${item.instructions}` : ''}`,
      instructions: item.instructions, intervalHours: Number(item.intervalHours), currentHours,
      cycleStartHours, dueHours, remainingHours, unit: 'HOURS', status, sortValue: remainingHours,
      occurrenceKey: dueHours.toFixed(2),
      entity: { id: subject.id, type: item.plan.asset ? 'ASSET' : 'VEHICLE', label },
      asset: item.plan.asset ? {
        id: item.plan.asset.id, publicCode: item.plan.asset.publicCode,
        serialOrEngine: item.plan.asset.serialOrEngine, description: item.plan.asset.description,
      } : undefined,
      vehicle: item.plan.vehicle ? { id: item.plan.vehicle.id, plate: item.plan.vehicle.plate } : undefined,
      recipients: this.mapRecipients(topic.recipients),
    };
  }

  private genericDateReminder(topic: any) {
    const dueAt = topic.dueAt as Date;
    const remainingDays = this.daysUntil(dueAt);
    const warningDays = topic.warningDays ?? 30;
    const status: ReminderStatus = remainingDays < 0 ? 'OVERDUE' : remainingDays <= warningDays ? 'DUE' : 'UPCOMING';
    const variables = {
      entityId: topic.entityId,
      dueDate: dueAt.toISOString().slice(0, 10),
      remainingDays: String(remainingDays),
      status,
    };
    return {
      topicId: topic.id, entityType: topic.entityType, entityId: topic.entityId, eventType: topic.eventType,
      title: this.renderTemplate(topic.titleTemplate ?? topic.eventType, variables),
      message: this.renderTemplate(topic.messageTemplate ?? `Vence el {{dueDate}}`, variables),
      status, dueAt, remainingDays, unit: 'DAYS', sortValue: remainingDays,
      occurrenceKey: dueAt.toISOString().slice(0, 10),
      entity: { id: topic.entityId, type: topic.entityType, label: topic.entityId },
      recipients: this.mapRecipients(topic.recipients),
    };
  }

  private async dispatchOne(reminder: any, recipient: any, channel: NotificationChannel) {
    const key = { topicId: reminder.topicId, userId: recipient.userId, occurrenceKey: reminder.occurrenceKey, channel };
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { topicId_userId_occurrenceKey_channel: key },
    });
    if (existing?.status === NotificationDeliveryStatus.SENT) return 'skipped';
    if (existing?.status === NotificationDeliveryStatus.SENDING && existing.updatedAt < new Date(Date.now() - 600000)) {
      await this.prisma.notificationDelivery.updateMany({
        where: { id: existing.id, status: NotificationDeliveryStatus.SENDING, updatedAt: existing.updatedAt },
        data: { status: NotificationDeliveryStatus.FAILED, error: 'Stale delivery claim recovered' },
      });
    }
    const delivery = await this.prisma.notificationDelivery.upsert({
      where: { topicId_userId_occurrenceKey_channel: key }, create: key, update: {},
    });
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.FAILED] } },
      data: { status: NotificationDeliveryStatus.SENDING, error: null },
    });
    if (!claimed.count) return 'skipped';
    const message: NotificationMessage = {
      title: reminder.title,
      body: reminder.message,
      link: reminder.link,
      recipientName: recipient.name,
    };
    try {
      const response = channel === NotificationChannel.WHATSAPP
        ? await this.transport.sendWhatsapp(recipient.phone, message)
        : await this.transport.sendEmail(recipient.email, message);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: response.sent
          ? { status: NotificationDeliveryStatus.SENT, sentAt: new Date(), error: null }
          : { status: NotificationDeliveryStatus.FAILED, error: response.reason },
      });
      return response.sent ? 'sent' : 'failed';
    } catch (error) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.FAILED, error: this.errorMessage(error) },
      });
      return 'failed';
    }
  }

  private async replaceRecipients(topicId: string, recipients: NotificationRecipientDto[], db: DbClient) {
    const data = this.recipientData(recipients);
    await db.notificationRecipient.deleteMany({ where: { topicId } });
    if (data.length) {
      await db.notificationRecipient.createMany({ data: data.map((recipient) => ({ topicId, ...recipient })) });
    }
  }

  private recipientData(recipients: NotificationRecipientDto[]) {
    const ids = recipients.map((recipient) => recipient.userId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Recipients cannot be duplicated');
    return recipients.map((recipient) => ({
      userId: recipient.userId,
      emailEnabled: false,
      smsEnabled: false,
      whatsappEnabled: recipient.whatsappEnabled ?? true,
    }));
  }

  private async assertRecipients(recipients: NotificationRecipientDto[], db: DbClient) {
    this.recipientData(recipients);
    const ids = [...new Set(recipients.map((recipient) => recipient.userId))];
    const count = await db.user.count({ where: { id: { in: ids }, active: true } });
    if (count !== ids.length) throw new BadRequestException('Every recipient must be an active user');
  }

  private async assertTopic(id: string) {
    if (!await this.prisma.notificationTopic.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Notification topic not found');
    }
  }

  private topicRecipientsInclude() {
    return { recipients: { include: { user: { select: { id: true, email: true, active: true, employee: true } } } } } as const;
  }

  private mapRecipients(recipients: any[]) {
    return recipients.map((recipient) => ({
      userId: recipient.userId,
      name: recipient.user.employee
        ? `${recipient.user.employee.name} ${recipient.user.employee.lastName}`.trim() : recipient.user.email,
      email: recipient.user.email,
      phone: recipient.user.employee?.phone ?? null,
      emailEnabled: recipient.emailEnabled,
      smsEnabled: recipient.smsEnabled,
      whatsappEnabled: recipient.whatsappEnabled,
    }));
  }

  private vehicleWarningDays() {
    const configured = Number(process.env.VEHICLE_DOCUMENT_WARNING_DAYS ?? 30);
    return Number.isFinite(configured) && configured >= 0 ? configured : 30;
  }

  private daysUntil(value: Date) {
    const today = new Date();
    const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const due = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    return Math.ceil((due - start) / 86400000);
  }

  private addCalendarDays(value: Date, days: number) {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private formatDate(value: Date) {
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value);
  }

  private appLink(path: string) {
    const base = process.env.PUBLIC_WEB_URL?.trim()?.replace(/\/+$/, '');
    return base ? `${base}${path}` : path;
  }

  private renderTemplate(template: string, variables: Record<string, string>) {
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key: string) => variables[key] ?? match);
  }

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : 'Unknown notification error').slice(0, 500);
  }
}
