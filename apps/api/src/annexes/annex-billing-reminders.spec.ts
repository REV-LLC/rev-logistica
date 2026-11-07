import { AnnexBillingRemindersService } from './annex-billing-reminders.service';
const now = new Date('2026-11-07T14:00:00Z');
const office = '00000000-0000-4000-8000-000000000001';
const opts = {
  enabled: true,
  userIds: [office],
  ageDays: 7,
  repeatDays: 7,
  hour: 9,
};
function fixture(settings = opts) {
  const db = {
    appSetting: {
      findUnique: jest.fn().mockResolvedValue({ value: settings }),
      upsert: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: office,
          employee: { name: 'Ana', lastName: '', phone: '3001234567' },
        },
      ]),
    },
    notificationTopic: {
      upsert: jest.fn().mockResolvedValue({ id: 'topic', active: true }),
    },
    notificationDelivery: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const overview = {
    overview: jest.fn().mockResolvedValue({
      rows: [
        {
          customerId: 'a',
          customerName: 'Cliente',
          siteName: 'Obra',
          from: '2026-10-16',
          to: '2026-10-31',
          cutTo: '2026-10-31',
          invoiceNumber: null,
        },
        { customerId: 'b', cutTo: '2026-10-15', invoiceNumber: 'FE-20' },
        { customerId: 'c', cutTo: '2026-11-15', invoiceNumber: null },
      ],
    }),
  };
  const notifications = { sendAnnexBillingReminder: jest.fn() };
  const service = new AnnexBillingRemindersService(
    db as never,
    overview as never,
    notifications as never,
  );
  return { db, service, overview, notifications };
}
it('sends only closed, aged, unbilled cuts to selected active Office personnel', async () => {
  const f = fixture();
  await f.service.dispatch(now);
  expect(f.db.user.findMany.mock.calls[0][0].where).toMatchObject({
    active: true,
    role: 'OFFICE',
  });
  expect(f.notifications.sendAnnexBillingReminder).toHaveBeenCalledTimes(1);
  expect(f.notifications.sendAnnexBillingReminder).toHaveBeenCalledWith(
    expect.objectContaining({
      phone: '+573001234567',
      userId: office,
      occurrenceKey: 'daily:2026-11-07',
      message: expect.stringContaining('1 corte sin factura'),
    }),
  );
});
it('honors the configured interval, disabled state and local hour before scanning worksites', async () => {
  const f = fixture();
  f.db.notificationDelivery.findMany.mockResolvedValue([{ userId: office }]);
  await f.service.dispatch(now);
  expect(f.overview.overview).not.toHaveBeenCalled();
  const off = fixture({ ...opts, enabled: false });
  await off.service.dispatch(now);
  expect(off.db.user.findMany).not.toHaveBeenCalled();
  await f.service.dispatch(new Date('2026-11-07T12:00:00Z'));
  expect(f.db.user.findMany).toHaveBeenCalledTimes(1);
});
it('rejects enabling a recipient outside the reachable Office list', async () => {
  const f = fixture();
  await expect(
    f.service.configure({
      ...opts,
      userIds: ['00000000-0000-4000-8000-000000000002'],
    }),
  ).rejects.toThrow('Office');
  expect(f.db.appSetting.upsert).not.toHaveBeenCalled();
});

it('honors a disable made while the portfolio was being calculated', async () => {
  const f = fixture();
  f.db.appSetting.findUnique
    .mockResolvedValueOnce({ value: opts })
    .mockResolvedValue({ value: { ...opts, enabled: false } });
  await f.service.dispatch(now);
  expect(f.notifications.sendAnnexBillingReminder).not.toHaveBeenCalled();
});
