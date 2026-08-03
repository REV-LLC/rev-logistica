import {
  DocumentStatus,
  DocumentType,
  InventorySnapshotDestinationType,
  MovementType,
  Prisma,
  PrismaClient,
  Role,
  SkuControlType,
} from '@prisma/client';
import { normalizeSkuReference } from '../src/inventory/catalog-reference-normalization';
import { legacyInventoryQuantityMultiplier } from '../src/inventory/legacy-inventory-quantity';
import { loadJsonFile } from './load-json-file';

type JsonRecord = Record<string, any>;

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const sourceKey = 'INVENTORY_2026_07_29';
const correctionConsecutive = 'ADJ-CORRECCION-NAVES-20260730';
const catalogData = loadJsonFile<JsonRecord>(
  'catalog-mapping-final.json',
  '--catalog-file',
);

function positionKey(
  skuId: string,
  ownerWarehouseId: string,
  customerWorksiteId: string | null,
) {
  return [skuId, ownerWarehouseId, customerWorksiteId ?? ''].join('|');
}

async function main() {
  const mappings = (catalogData.mappings as JsonRecord[]).filter(
    (mapping) =>
      legacyInventoryQuantityMultiplier(
        String(mapping.articleCode),
        mapping.quantityMultiplier,
      ) > 1,
  );
  if (!mappings.length) {
    throw new Error('No hay equivalencias con multiplicador por corregir.');
  }

  const articleCodes = mappings.map((mapping) => String(mapping.articleCode));
  const mappingByArticle = new Map(
    mappings.map((mapping) => [String(mapping.articleCode), mapping]),
  );
  const snapshot = await prisma.inventorySnapshot.findUnique({
    where: { sourceKey },
    include: {
      entries: {
        where: {
          articleCode: { in: articleCodes },
          finalBalance: { gt: 0 },
        },
      },
    },
  });
  if (!snapshot) {
    throw new Error(`Snapshot ${sourceKey} no encontrado.`);
  }

  const existingCorrection = await prisma.document.findUnique({
    where: { consecutive: correctionConsecutive },
    select: { id: true, status: true },
  });
  const legacyWarehouses = await prisma.legacyWarehouse.findMany({
    where: {
      code: {
        in: [
          ...new Set(
            snapshot.entries.map((entry) => entry.legacyWarehouseCode),
          ),
        ],
      },
    },
    select: { code: true, operationalWarehouseId: true },
  });
  const warehouseByLegacyCode = new Map(
    legacyWarehouses.map((warehouse) => [
      warehouse.code,
      warehouse.operationalWarehouseId,
    ]),
  );

  const skuByArticle = new Map<
    string,
    { id: string; name: string; family: string }
  >();
  for (const mapping of mappings) {
    const expectedName = normalizeSkuReference(
      mapping.finalSkuName,
      mapping.normalizedSize ?? null,
    );
    const sku = await prisma.sku.findFirst({
      where: {
        name: { equals: expectedName, mode: 'insensitive' },
        assetFamily: {
          name: {
            equals: mapping.normalizedFamily,
            mode: 'insensitive',
          },
          controlType: SkuControlType.BULK,
        },
      },
      select: {
        id: true,
        name: true,
        assetFamily: { select: { name: true } },
      },
    });
    if (!sku) {
      throw new Error(
        `No se encontró el SKU ${expectedName} de ${mapping.normalizedFamily}.`,
      );
    }
    skuByArticle.set(String(mapping.articleCode), {
      id: sku.id,
      name: sku.name,
      family: sku.assetFamily.name,
    });
  }

  const warehouseAdjustments = new Map<
    string,
    {
      skuId: string;
      skuName: string;
      ownerWarehouseId: string;
      quantity: number;
    }
  >();
  const worksiteAdjustments = new Map<
    string,
    {
      skuId: string;
      skuName: string;
      ownerWarehouseId: string;
      customerWorksiteId: string;
      quantity: number;
    }
  >();

  for (const entry of snapshot.entries) {
    const mapping = mappingByArticle.get(entry.articleCode);
    const sku = skuByArticle.get(entry.articleCode);
    const ownerWarehouseId = warehouseByLegacyCode.get(
      entry.legacyWarehouseCode,
    );
    if (!mapping || !sku) {
      throw new Error(
        `Mapeo o SKU ausente para artículo ${entry.articleCode}.`,
      );
    }
    if (!ownerWarehouseId) {
      throw new Error(
        `Bodega histórica ${entry.legacyWarehouseCode} sin vínculo operativo.`,
      );
    }
    const missingQuantity =
      Number(entry.finalBalance) *
      (legacyInventoryQuantityMultiplier(
        entry.articleCode,
        mapping.quantityMultiplier,
      ) -
        1);
    const warehouseKey = positionKey(sku.id, ownerWarehouseId, null);
    const currentWarehouse = warehouseAdjustments.get(warehouseKey);
    if (currentWarehouse) {
      currentWarehouse.quantity += missingQuantity;
    } else {
      warehouseAdjustments.set(warehouseKey, {
        skuId: sku.id,
        skuName: sku.name,
        ownerWarehouseId,
        quantity: missingQuantity,
      });
    }

    if (entry.destinationType === InventorySnapshotDestinationType.WORKSITE) {
      if (!entry.customerWorksiteId) {
        throw new Error(
          `Artículo ${entry.articleCode}, fila ${entry.sourceRow}, sin obra vinculada.`,
        );
      }
      const worksiteKey = positionKey(
        sku.id,
        ownerWarehouseId,
        entry.customerWorksiteId,
      );
      const currentWorksite = worksiteAdjustments.get(worksiteKey);
      if (currentWorksite) {
        currentWorksite.quantity += missingQuantity;
      } else {
        worksiteAdjustments.set(worksiteKey, {
          skuId: sku.id,
          skuName: sku.name,
          ownerWarehouseId,
          customerWorksiteId: entry.customerWorksiteId,
          quantity: missingQuantity,
        });
      }
    }
  }

  const affectedWorksites = worksiteAdjustments.size
    ? await prisma.customerWorksite.findMany({
        where: {
          id: {
            in: [...worksiteAdjustments.values()].map(
              (adjustment) => adjustment.customerWorksiteId,
            ),
          },
        },
        select: {
          id: true,
          customer: { select: { name: true } },
          worksite: { select: { name: true, externalCode: true } },
        },
      })
    : [];
  const worksiteById = new Map(
    affectedWorksites.map((relation) => [relation.id, relation]),
  );
  const plan = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    sourceKey,
    correctionConsecutive,
    alreadyApplied: !!existingCorrection,
    equivalences: mappings.map((mapping) => ({
      articleCode: mapping.articleCode,
      source: mapping.articleName,
      target: mapping.finalSkuName,
      multiplier: legacyInventoryQuantityMultiplier(
        String(mapping.articleCode),
        mapping.quantityMultiplier,
      ),
    })),
    warehouseAdjustments: [...warehouseAdjustments.values()].map(
      (adjustment) => ({
        sku: adjustment.skuName,
        quantity: adjustment.quantity,
      }),
    ),
    worksiteAdjustments: [...worksiteAdjustments.values()].map((adjustment) => {
      const relation = worksiteById.get(adjustment.customerWorksiteId);
      return {
        sku: adjustment.skuName,
        customer: relation?.customer.name ?? null,
        worksite: relation?.worksite.name ?? null,
        externalCode: relation?.worksite.externalCode ?? null,
        quantity: adjustment.quantity,
      };
    }),
  };
  console.log(JSON.stringify(plan, null, 2));

  if (existingCorrection) {
    console.log('La corrección ya fue aplicada; no se realizaron cambios.');
    return;
  }
  if (!apply) {
    console.log('Preflight correcto. Usa --apply para publicar la corrección.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const correctionStillAbsent = await tx.document.findUnique({
      where: { consecutive: correctionConsecutive },
      select: { id: true },
    });
    if (correctionStillAbsent) {
      throw new Error('La corrección fue aplicada después del preflight.');
    }
    const admin = await tx.user.findFirst({
      where: { role: Role.ADMIN, active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('No hay usuario ADMIN activo para firmar la corrección.');
    }

    const document = await tx.document.create({
      data: {
        type: DocumentType.ADJUSTMENT,
        status: DocumentStatus.CONFIRMED,
        consecutive: correctionConsecutive,
        createdBy: admin.id,
        notes:
          'Corrección del corte inicial: 1 cuerpo de andamio convencional equivale a 2 naves.',
        items: {
          create: [...warehouseAdjustments.values()].map((adjustment) => ({
            skuId: adjustment.skuId,
            quantity: new Prisma.Decimal(adjustment.quantity),
          })),
        },
      },
      select: { id: true, type: true },
    });

    for (const adjustment of warehouseAdjustments.values()) {
      await tx.stockLedger.create({
        data: {
          skuId: adjustment.skuId,
          warehouseId: adjustment.ownerWarehouseId,
          ownerWarehouseId: adjustment.ownerWarehouseId,
          customerWorksiteId: null,
          movementType: MovementType.ADJUST,
          quantity: new Prisma.Decimal(adjustment.quantity),
          refDocumentId: document.id,
          refDocumentType: document.type,
          createdBy: admin.id,
        },
      });
    }
    for (const adjustment of worksiteAdjustments.values()) {
      await tx.stockLedger.create({
        data: {
          skuId: adjustment.skuId,
          warehouseId: null,
          ownerWarehouseId: adjustment.ownerWarehouseId,
          customerWorksiteId: adjustment.customerWorksiteId,
          movementType: MovementType.ON_SITE,
          quantity: new Prisma.Decimal(adjustment.quantity),
          refDocumentId: document.id,
          refDocumentType: document.type,
          createdBy: admin.id,
        },
      });
    }
    return {
      documentId: document.id,
      ledgerRows: warehouseAdjustments.size + worksiteAdjustments.size,
      totalNavesAdded: [...warehouseAdjustments.values()].reduce(
        (total, adjustment) => total + adjustment.quantity,
        0,
      ),
    };
  });

  console.log(JSON.stringify({ applied: true, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
