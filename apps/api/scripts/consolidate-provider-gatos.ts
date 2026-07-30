import { PrismaClient, SkuControlType } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const mappings = [
  {
    sourceSkuId: 'd6094262-4f64-4b6d-b345-04dd80da5db4',
    sourceName: 'GATO CORTO (2.60 M - 2.80 M)',
    targetSkuId: 'a57876c4-52dc-4b65-9019-0633d27f1bd5',
    targetName: 'GATO CORTO (2.00 M - 3.00 M)',
  },
  {
    sourceSkuId: 'de314ac3-0c2d-43c7-91b6-9c89825d7d3e',
    sourceName: 'GATO CORTO (3.60 M)',
    targetSkuId: 'e7140bfd-4dcd-46b4-b26e-810568e5f827',
    targetName: 'GATO LARGO (2.30 M - 3.60 M)',
  },
] as const;

async function loadSku(id: string) {
  return prisma.sku.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      active: true,
      assetFamily: { select: { controlType: true } },
      _count: {
        select: {
          assets: true,
          documentItems: true,
          ledger: true,
        },
      },
    },
  });
}

async function main() {
  const plan = await Promise.all(
    mappings.map(async (mapping) => ({
      mapping,
      source: await loadSku(mapping.sourceSkuId),
      target: await loadSku(mapping.targetSkuId),
    })),
  );

  for (const item of plan) {
    if (!item.source || item.source.name !== item.mapping.sourceName) {
      throw new Error(
        `SKU origen inválido: ${item.mapping.sourceSkuId} (${item.source?.name ?? 'no existe'}).`,
      );
    }
    if (!item.target || item.target.name !== item.mapping.targetName) {
      throw new Error(
        `SKU destino inválido: ${item.mapping.targetSkuId} (${item.target?.name ?? 'no existe'}).`,
      );
    }
    if (
      item.source.assetFamily.controlType !== SkuControlType.BULK ||
      item.target.assetFamily.controlType !== SkuControlType.BULK
    ) {
      throw new Error(`La consolidación solo admite referencias BULK.`);
    }
    if (item.source._count.assets > 0) {
      throw new Error(
        `${item.source.name} tiene assets serializados y no se puede consolidar automáticamente.`,
      );
    }
  }

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    mappings: plan.map(({ source, target }) => ({
      source: source!.name,
      target: target!.name,
      ledgerRows: source!._count.ledger,
      documentItems: source!._count.documentItems,
      sourceActive: source!.active,
    })),
  });

  if (!apply) {
    console.log(
      'Preflight correcto. Usa --apply para consolidar las referencias.',
    );
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    let ledgerRowsMoved = 0;
    let documentItemsMoved = 0;

    for (const mapping of mappings) {
      const source = await tx.sku.findUnique({
        where: { id: mapping.sourceSkuId },
        select: {
          name: true,
          _count: { select: { assets: true } },
        },
      });
      const target = await tx.sku.findUnique({
        where: { id: mapping.targetSkuId },
        select: { name: true },
      });
      if (
        !source ||
        source.name !== mapping.sourceName ||
        !target ||
        target.name !== mapping.targetName ||
        source._count.assets > 0
      ) {
        throw new Error(`Las referencias cambiaron después del preflight.`);
      }

      const documentItems = await tx.documentItem.updateMany({
        where: { skuId: mapping.sourceSkuId },
        data: { skuId: mapping.targetSkuId },
      });
      documentItemsMoved += documentItems.count;

      const ledgerRows = await tx.stockLedger.updateMany({
        where: { skuId: mapping.sourceSkuId },
        data: { skuId: mapping.targetSkuId },
      });
      ledgerRowsMoved += ledgerRows.count;

      await tx.sku.update({
        where: { id: mapping.sourceSkuId },
        data: { active: false },
      });
    }

    return {
      ledgerRowsMoved,
      documentItemsMoved,
      sourcesDeactivated: mappings.length,
    };
  });

  console.log(result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
