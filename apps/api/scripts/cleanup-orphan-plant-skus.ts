import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);
const apply = process.argv.includes('--apply');
const backupFileArgIndex = process.argv.indexOf('--backup-file');
const backupFile =
  backupFileArgIndex >= 0 ? process.argv[backupFileArgIndex + 1] : null;

async function loadPlan(client: Prisma.TransactionClient | PrismaClient) {
  const family = await client.assetFamily.findUnique({
    where: { code: 'PLANTA_ELECTRICA' },
    select: { id: true, code: true, name: true },
  });
  if (!family) throw new Error('No existe la familia PLANTA_ELECTRICA.');

  const skus = await client.sku.findMany({
    where: { assetFamilyId: family.id },
    include: {
      providerPrices: true,
      _count: {
        select: {
          assets: true,
          ledger: true,
          documentItems: true,
          providerReceiptItems: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  const orphanSkus = skus.filter(
    (sku) =>
      sku._count.assets === 0 &&
      sku._count.ledger === 0 &&
      sku._count.documentItems === 0 &&
      sku._count.providerReceiptItems === 0,
  );

  const counters = await client.assetInternalCounter.findMany({
    where: { assetSubfamily: { assetFamilyId: family.id } },
    include: {
      ownerWarehouse: { select: { name: true } },
      assetSubfamily: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const countersWithAssetCount = await Promise.all(
    counters.map(async (counter) => ({
      counter,
      assetsCount: await client.asset.count({
        where: {
          warehouseOwnerId: counter.ownerWarehouseId,
          sku: { assetSubfamilyId: counter.assetSubfamilyId },
        },
      }),
    })),
  );
  const orphanCounters = countersWithAssetCount
    .filter(({ assetsCount }) => assetsCount === 0)
    .map(({ counter }) => counter);

  return { family, skus, orphanSkus, counters, orphanCounters };
}

async function main() {
  const plan = await loadPlan(prisma);
  const backup = {
    createdAt: new Date().toISOString(),
    mode: apply ? 'APPLY' : 'DRY_RUN',
    family: plan.family,
    skus: plan.skus,
    counters: plan.counters,
    candidates: {
      skuIds: plan.orphanSkus.map((sku) => sku.id),
      counterIds: plan.orphanCounters.map((counter) => counter.id),
    },
  };

  if (backupFile) {
    const absoluteBackupFile = resolve(backupFile);
    await writeFile(
      absoluteBackupFile,
      `${JSON.stringify(backup, null, 2)}\n`,
      {
        flag: 'wx',
      },
    );
    console.log(`Backup creado: ${absoluteBackupFile}`);
  }

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    orphanSkus: plan.orphanSkus.map((sku) => ({ id: sku.id, name: sku.name })),
    orphanCounters: plan.orphanCounters.map((counter) => ({
      id: counter.id,
      warehouse: counter.ownerWarehouse.name,
      subfamily: counter.assetSubfamily.name,
      nextNumber: counter.nextNumber,
    })),
  });

  if (!apply) return;

  const deleted = await prisma.$transaction(
    async (tx) => {
      const currentPlan = await loadPlan(tx);
      const expectedSkuIds = plan.orphanSkus.map((sku) => sku.id).sort();
      const currentSkuIds = currentPlan.orphanSkus.map((sku) => sku.id).sort();
      const expectedCounterIds = plan.orphanCounters
        .map((counter) => counter.id)
        .sort();
      const currentCounterIds = currentPlan.orphanCounters
        .map((counter) => counter.id)
        .sort();

      if (
        JSON.stringify(expectedSkuIds) !== JSON.stringify(currentSkuIds) ||
        JSON.stringify(expectedCounterIds) !== JSON.stringify(currentCounterIds)
      ) {
        throw new Error(
          'Los candidatos cambiaron después del preflight; no se aplicó la limpieza.',
        );
      }

      const countersResult = await tx.assetInternalCounter.deleteMany({
        where: { id: { in: expectedCounterIds } },
      });
      const skusResult = await tx.sku.deleteMany({
        where: { id: { in: expectedSkuIds } },
      });

      return { skus: skusResult.count, counters: countersResult.count };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  console.log({ deleted });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
