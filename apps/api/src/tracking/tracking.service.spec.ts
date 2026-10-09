import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

describe('TrackingService', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  let service: TrackingService;
  let fetchMock: jest.SpyInstance;
  const identity = { sub: 'rev-user', exp: Math.floor(Date.now() / 1000) + 3600 };
  beforeEach(() => {
    process.env.TRACCAR_WEB_URL = 'https://gps.revcontractorsllc.com';
    process.env.TRACCAR_INTEGRATION_EMAIL = 'integration@rev.invalid';
    process.env.TRACCAR_INTEGRATION_PASSWORD = 'test-server-secret';
    prisma.user.findUnique.mockResolvedValue({ id: identity.sub, email: 'office@rev.invalid', active: true, role: 'OFFICE' });
    service = new TrackingService(prisma as never);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => { fetchMock.mockRestore(); jest.clearAllMocks(); delete process.env.TRACCAR_WEB_URL; delete process.env.TRACCAR_INTEGRATION_EMAIL; delete process.env.TRACCAR_INTEGRATION_PASSWORD; });
  const reply = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
  it.each([{ active: false, role: 'ADMIN' }, { active: true, role: 'DRIVER' }, { active: true, role: 'WAREHOUSE_TABLET' }])('rejects current unauthorized identity %j without reaching Traccar', async (user) => {
    prisma.user.findUnique.mockResolvedValue({ ...user, id: identity.sub });
    await expect(service.createSession(identity)).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not extend a revoked or expired REV session', async () => {
    await expect(service.createSession({ ...identity, exp: 1 })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('provisions a separate readonly account, assigns devices and returns only a bounded native session', async () => {
    fetchMock.mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply({ id: 7, email: 'rev-rev-user@rev.invalid' }))
      .mockResolvedValueOnce(reply([{ id: 1 }, { id: 2 }])).mockResolvedValueOnce(reply([{ id: 1 }]))
      .mockResolvedValueOnce(reply(null, 204)).mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply('native-token'));
    const result = await service.createSession(identity);
    const calls = fetchMock.mock.calls;
    const profile = JSON.parse(calls[1][1].body);
    expect(profile).toMatchObject({ administrator: false, readonly: true, deviceReadonly: true, limitCommands: true, attributes: { revUserId: identity.sub } });
    expect(JSON.parse(calls[4][1].body)).toEqual({ userId: 7, deviceId: 2 });
    expect(calls[6][1].headers.Authorization).not.toEqual(calls[0][1].headers.Authorization);
    expect(result.panelUrl).toEqual('https://gps.revcontractorsllc.com/');
    expect(new URL(result.sessionUrl).searchParams.get('token')).toBe('native-token');
    expect(Date.parse(result.expiresAt)).toBeLessThanOrEqual(Date.now() + 300000);
    expect(JSON.stringify(result)).not.toContain('test-server-secret');
  });
  it('never hijacks an existing unmanaged native account', async () => {
    fetchMock.mockResolvedValueOnce(reply([{ id: 7, email: 'rev-rev-user@rev.invalid' }]));
    await expect(service.createSession(identity)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('redacts native server errors and tokens', async () => {
    fetchMock.mockRejectedValue(new Error('secret native token and password'));
    await expect(service.createSession(identity)).rejects.toThrow('No fue posible abrir el seguimiento. Intenta nuevamente.');
  });
});
