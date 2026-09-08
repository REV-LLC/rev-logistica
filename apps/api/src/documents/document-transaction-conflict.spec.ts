import { Prisma } from '@prisma/client';
import { isSerializationConflict } from './document-transaction-conflict';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('synthetic failure', { code, meta, clientVersion: 'test' });

describe('document transaction conflict classification', () => {
  it.each([
    known('P2034'),
    known('P2010', { code: '40001' }),
    known('P2010', { code: '40P01' }),
  ])('retries only recognized serialization/deadlock conflicts: %p', (error) => {
    expect(isSerializationConflict(error)).toBe(true);
  });

  it.each([
    known('P2010'),
    known('P2010', { code: '23505' }),
    known('P2010', { code: '23503' }),
    known('P2010', { code: 40001 }),
    known('P2010', { message: 'could not serialize access due to concurrent update' }),
    known('P2002', { code: '40001' }),
    known('P2025'),
    new Error('P2034'),
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    null,
    undefined,
  ])('does not hide other failures with retries: %p', (error) => {
    expect(isSerializationConflict(error)).toBe(false);
  });
});
