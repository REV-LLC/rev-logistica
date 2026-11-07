import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
import { normalizeStoredColombianPhone } from '../messaging/colombian-phone';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnnexBillingOverviewService } from './annex-billing-overview.service';

const settingsKey = 'billing.annex.office-reminders';
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    ageDays: z.number().int().min(1).max(60),
    repeatDays: z.number().int().min(1).max(30),
    hour: z.number().int().min(0).max(23),
    userIds: z
      .array(z.string().uuid())
      .max(100)
      .transform((ids) => [...new Set(ids)]),
  })
  .strict();
const defaults = {
  enabled: false,
  ageDays: 7,
  repeatDays: 7,
  hour: 9,
  userIds: [] as string[],
};
const topicKey = {
  entityType: 'SYSTEM',
  entityId: 'annex-unbilled',
  eventType: 'ANNEX_UNBILLED',
};
const dayMs = 86400000;

@Injectable()
export class AnnexBillingRemindersService {
  constructor(
    private readonly db: PrismaService,
    private readonly overview: AnnexBillingOverviewService,
    private readonly notifications: NotificationsService,
  ) {}

  private async settings() {
    const setting = await this.db.appSetting.findUnique({
      where: { key: settingsKey },
    });
    return setting ? settingsSchema.parse(setting.value) : defaults;
  }

  private async officeUsers() {
    const users = await this.db.user.findMany({
      where: {
        role: Role.OFFICE,
        active: true,
        employee: { is: { active: true } },
      },
      select: {
        id: true,
        employee: { select: { name: true, lastName: true, phone: true } },
      },
      orderBy: { employee: { name: 'asc' } },
    });
    return users.map((user) => ({
      id: user.id,
      name: `${user.employee!.name} ${user.employee!.lastName}`.trim(),
      phone: normalizeStoredColombianPhone(user.employee!.phone),
    }));
  }

  async configuration() {
    const [settings, users] = await Promise.all([
      this.settings(),
      this.officeUsers(),
    ]);
    return {
      settings,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        hasPhone: !!user.phone,
      })),
    };
  }

  async configure(body: unknown) {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Revisa los días, la hora y los destinatarios del recordatorio.',
      );
    const settings = parsed.data;
    if (settings.enabled) {
      const users = await this.officeUsers();
      if (
        !settings.userIds.length ||
        settings.userIds.some(
          (id) => !users.some((u) => u.id === id && u.phone),
        )
      ) {
        throw new BadRequestException(
          'Selecciona personal activo de Office con un celular válido.',
        );
      }
    }
    await this.db.appSetting.upsert({
      where: { key: settingsKey },
      create: { key: settingsKey, category: 'BILLING', value: settings },
      update: { value: settings },
    });
    return this.configuration();
  }

  @Cron('0 */15 * * * *', {
    timeZone: 'America/Bogota',
    waitForCompletion: true,
  })
  async scheduled() {
    if (
      process.env.NOTIFICATION_AUTO_DISPATCH?.trim().toLowerCase() === 'false'
    )
      return;
    await this.dispatch(new Date());
  }

  async dispatch(now: Date) {
    const settings = await this.settings();
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
    );
    if (!settings.enabled || hour !== settings.hour) return;
    const users = (await this.officeUsers()).filter(
      (u) => u.phone && settings.userIds.includes(u.id),
    );
    if (!users.length) return;
    const topic = await this.db.notificationTopic.upsert({
      where: { entityType_entityId_eventType: topicKey },
      create: topicKey,
      update: {},
    });
    if (!topic.active) return;
    const today = inventoryBusinessDay(now);
    const recent = await this.db.notificationDelivery.findMany({
      where: {
        topicId: topic.id,
        userId: { in: users.map((u) => u.id) },
        sentAt: {
          gte: new Date(
            Date.parse(today + 'T05:00:00Z') -
              (settings.repeatDays - 1) * dayMs,
          ),
        },
      },
      select: { userId: true },
    });
    const due = users.filter(
      (u) => !recent.some((delivery) => delivery.userId === u.id),
    );
    if (!due.length) return;
    const report = await this.overview.overview(now);
    const pending = report.rows.filter(
      (row) =>
        !row.invoiceNumber &&
        row.cutTo < today &&
        (Date.parse(today) - Date.parse(row.cutTo)) / dayMs >= settings.ageDays,
    );
    if (!pending.length) return;
    const clients = new Set(pending.map((row) => row.customerId)).size;
    // The portfolio scan can outlive a change to Office recipients or the schedule.
    const latest = await this.settings();
    if (
      !latest.enabled ||
      latest.hour !== settings.hour ||
      latest.ageDays !== settings.ageDays ||
      latest.repeatDays !== settings.repeatDays
    )
      return;
    const currentUsers = (await this.officeUsers()).filter(
      (user) =>
        user.phone &&
        latest.userIds.includes(user.id) &&
        due.some((previous) => previous.id === user.id),
    );
    for (const user of currentUsers) {
      await this.notifications.sendAnnexBillingReminder({
        topicId: topic.id,
        occurrenceKey: 'daily:' + today,
        userId: user.id,
        name: user.name,
        phone: user.phone!,
        message: `Hay ${pending.length} ${pending.length === 1 ? 'corte' : 'cortes'} sin factura de ${clients} ${clients === 1 ? 'cliente' : 'clientes'}. El más antiguo corresponde a ${pending[0].customerName}, ${pending[0].siteName}, del ${pending[0].from} al ${pending[0].to}.`,
      });
    }
  }
}
