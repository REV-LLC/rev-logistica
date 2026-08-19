import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private timer?: NodeJS.Timeout;

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
    try {
      const result = await this.notifications.dispatchNotifications();
      if (result.sent || result.failed) this.logger.log(`Notification dispatch: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('Automatic notification dispatch failed', error instanceof Error ? error.stack : undefined);
    }
  }
}
