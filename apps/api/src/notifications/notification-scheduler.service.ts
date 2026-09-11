import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit() {
    if (process.env.NOTIFICATION_AUTO_DISPATCH?.trim().toLowerCase() === 'false') return;
    const configured = Number(process.env.NOTIFICATION_DISPATCH_INTERVAL_MINUTES ?? 1);
    const minutes = Number.isFinite(configured) && configured >= 1 ? configured : 1;
    this.timer = setInterval(() => void this.dispatch(), minutes * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async dispatch() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = [
        { name: 'Recordatorios existentes', run: () => this.notifications.dispatchNotifications() },
        { name: 'Recordatorio diario de horómetros', run: () => this.notifications.dispatchHourMeterReminders() },
      ];
      for (const job of jobs) {
        try {
          const result = await job.run();
          if (result.sent || result.failed) this.logger.log(`${job.name}: ${JSON.stringify(result)}`);
        } catch (error) {
          this.logger.error(`Falló el envío automático: ${job.name}`, error instanceof Error ? error.stack : String(error));
        }
      }
    } finally {
      this.running = false;
    }
  }
}
