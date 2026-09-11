import { Logger } from '@nestjs/common';
import { NotificationSchedulerService } from './notification-scheduler.service';

describe('NotificationSchedulerService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('runs both notification jobs even if existing reminders fail', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const notifications = {
      dispatchNotifications: jest.fn().mockRejectedValue(new Error('unavailable')),
      dispatchHourMeterReminders: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
    };
    const scheduler = new NotificationSchedulerService(notifications as any);
    await scheduler['dispatch']();
    expect(notifications.dispatchHourMeterReminders).toHaveBeenCalledTimes(1);
  });

  it('does not overlap ticks and releases the guard after a job fails', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const notifications = {
      dispatchNotifications: jest.fn().mockImplementation(async () => {
        await pending;
        return { sent: 0, failed: 0 };
      }),
      dispatchHourMeterReminders: jest.fn().mockRejectedValue(new Error('unavailable')),
    };
    const scheduler = new NotificationSchedulerService(notifications as any);
    const first = scheduler['dispatch']();
    await scheduler['dispatch']();
    expect(notifications.dispatchNotifications).toHaveBeenCalledTimes(1);
    release();
    await first;
    await scheduler['dispatch']();
    expect(notifications.dispatchNotifications).toHaveBeenCalledTimes(2);
  });
});
