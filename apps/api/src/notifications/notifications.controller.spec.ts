import { Role } from '@prisma/client';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  it.each([Role.ADMIN, Role.OFFICE])('gives %s the global reminders inbox', async (role) => {
    const listReminders = jest.fn().mockResolvedValue([]);
    const controller = new NotificationsController({ listReminders } as any);

    await controller.myReminders({
      user: { sub: 'user-1', email: 'user@example.com', role },
    } as any);

    expect(listReminders).toHaveBeenCalledWith(undefined);
  });

  it('keeps the driver inbox limited to assigned reminders', async () => {
    const listReminders = jest.fn().mockResolvedValue([]);
    const controller = new NotificationsController({ listReminders } as any);

    await controller.myReminders({
      user: { sub: 'driver-1', email: 'driver@example.com', role: Role.DRIVER },
    } as any);

    expect(listReminders).toHaveBeenCalledWith('driver-1');
  });
});
