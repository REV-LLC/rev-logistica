import { Prisma } from '@prisma/client';

/** Quantity stock is fungible. Serialize balance checks and writes, not dates. */
export async function lockBulkStock(tx: Prisma.TransactionClient, skuIds: string[]) {
  const ids = [...new Set(skuIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Sku" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE
  `);
}
