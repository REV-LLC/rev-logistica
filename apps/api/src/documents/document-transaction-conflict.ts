import { Prisma } from '@prisma/client';

/** Prisma wraps PostgreSQL failures from SELECT ... FOR UPDATE as raw-query errors. */
export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  return error.code === 'P2010'
    && (error.meta?.code === '40001' || error.meta?.code === '40P01');
}
