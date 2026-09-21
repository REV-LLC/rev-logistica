import { ReleasesController } from './releases.controller';

describe('Release acknowledgements', () => {
  const releaseId = 'a'.repeat(64);
  it('checks only the authenticated user acknowledgement', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const controller = new ReleasesController({ releaseAcknowledgement: { findUnique } } as never);
    expect(await controller.status({ releaseId }, { user: { sub: 'user-one' } })).toEqual({ acknowledged: false });
    expect(findUnique).toHaveBeenCalledWith({ where: { userId_releaseId: { userId: 'user-one', releaseId } }, select: { acknowledgedAt: true } });
    findUnique.mockResolvedValue({ acknowledgedAt: new Date() });
    expect(await controller.status({ releaseId }, { user: { sub: 'user-two' } })).toEqual({ acknowledged: true });
  });
  it('acknowledges idempotently with the authenticated identity', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const controller = new ReleasesController({ releaseAcknowledgement: { upsert } } as never);
    expect(await controller.acknowledge({ releaseId }, { user: { sub: 'user-one' } })).toEqual({ acknowledged: true });
    expect(upsert).toHaveBeenCalledWith({ where: { userId_releaseId: { userId: 'user-one', releaseId } }, create: { userId: 'user-one', releaseId }, update: {} });
  });
});
