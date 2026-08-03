import {
  InventorySnapshotDestinationType,
  InventorySnapshotOwnershipType,
  InventorySnapshotSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { loadJsonFile } from './load-json-file';

type InventoryRow = {
  sourceRow: number;
  ownershipType: 'OWN' | 'SUPPLIER';
  destinationType: 'WAREHOUSE' | 'WORKSITE';
  customerDocument?: string;
  sourceCustomerName?: string;
  matchedCustomerName?: string | null;
  worksiteExternalCode?: string;
  sourceWorksiteName?: string;
  matchedWorksiteName?: string | null;
  costCenterCode?: string;
  costCenterName?: string;
  legacyWarehouseCode: string;
  groupCode: string;
  groupName: string;
  subgroupCode?: string;
  subgroupName?: string;
  articleCode: string;
  articleName: string;
  initialBalance: number;
  inventoryIn: number;
  rentalIn: number;
  inventoryOut: number;
  rentalOut: number;
  finalBalance: number;
  unitWeight?: number;
  totalWeight?: number;
  relationStatus: string;
  warehouseMappingStatus: string;
  importStatus: string;
  observations?: string;
};

const normalizedData = loadJsonFile<any>(
  'inventory-snapshot-2026-07-29.normalized.json',
);
const prisma = new PrismaClient();
const apply = process.argv.slice(2).includes('--apply');
const sourceKey = 'INVENTORY_2026_07_29';

function relationKey(customerDocument?: string, worksiteExternalCode?: string) {
  return `${customerDocument ?? ''}|${worksiteExternalCode ?? ''}`;
}

async function main() {
  const relations = await prisma.customerWorksite.findMany({
    select: {
      id: true,
      customer: { select: { nitOrId: true } },
      worksite: { select: { externalCode: true } },
    },
  });
  const relationByExternalKey = new Map(
    relations.map((relation) => [
      relationKey(
        relation.customer.nitOrId ?? undefined,
        relation.worksite.externalCode ?? undefined,
      ),
      relation.id,
    ]),
  );

  const sources: Array<{
    sourceType: InventorySnapshotSourceType;
    rows: InventoryRow[];
  }> = [
    {
      sourceType: InventorySnapshotSourceType.OWN_WAREHOUSE,
      rows: normalizedData.ownWarehouseInventory as InventoryRow[],
    },
    {
      sourceType: InventorySnapshotSourceType.OWN_WORKSITE,
      rows: normalizedData.ownOnSiteInventory as InventoryRow[],
    },
    {
      sourceType: InventorySnapshotSourceType.SUPPLIER,
      rows: normalizedData.supplierInventory as InventoryRow[],
    },
  ];

  const entries = sources.flatMap(({ sourceType, rows }) =>
    rows.map((row) => {
      const customerWorksiteId =
        row.destinationType === 'WORKSITE'
          ? (relationByExternalKey.get(
              relationKey(row.customerDocument, row.worksiteExternalCode),
            ) ?? null)
          : null;
      return {
        sourceType,
        sourceRow: row.sourceRow,
        ownershipType: row.ownershipType as InventorySnapshotOwnershipType,
        destinationType:
          row.destinationType as InventorySnapshotDestinationType,
        customerWorksiteId,
        warehouseId: null,
        customerDocument: row.customerDocument ?? null,
        customerName: row.matchedCustomerName ?? row.sourceCustomerName ?? null,
        worksiteExternalCode: row.worksiteExternalCode ?? null,
        worksiteName: row.matchedWorksiteName ?? row.sourceWorksiteName ?? null,
        costCenterCode: row.costCenterCode ?? null,
        costCenterName: row.costCenterName ?? null,
        legacyWarehouseCode: row.legacyWarehouseCode,
        groupCode: row.groupCode,
        groupName: row.groupName,
        subgroupCode: row.subgroupCode ?? null,
        subgroupName: row.subgroupName ?? null,
        articleCode: row.articleCode,
        articleName: row.articleName,
        initialBalance: row.initialBalance,
        inventoryIn: row.inventoryIn,
        rentalIn: row.rentalIn,
        inventoryOut: row.inventoryOut,
        rentalOut: row.rentalOut,
        finalBalance: row.finalBalance,
        unitWeight: row.unitWeight ?? null,
        totalWeight: row.totalWeight ?? null,
        relationStatus: row.relationStatus,
        warehouseMappingStatus: row.warehouseMappingStatus,
        importStatus: row.importStatus,
        observations: row.observations ?? null,
      };
    }),
  );

  const unresolvedWorksiteRows = entries.filter(
    (entry) =>
      entry.destinationType === InventorySnapshotDestinationType.WORKSITE &&
      entry.customerWorksiteId === null,
  ).length;
  const ledgerBefore = await prisma.stockLedger.count();

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    sourceKey,
    snapshotDate: normalizedData.meta.snapshotDate,
    articles: normalizedData.catalog.length,
    warehouseMappings: normalizedData.warehouseMappings.length,
    entries: entries.length,
    sourceRows: Object.fromEntries(
      sources.map(({ sourceType, rows }) => [sourceType, rows.length]),
    ),
    unresolvedWorksiteRows,
    stockLedgerRowsBefore: ledgerBefore,
  });

  if (!apply) {
    console.log(
      'Vista previa únicamente. Usa --apply para cargar el snapshot en staging.',
    );
    return;
  }

  const snapshot = await prisma.inventorySnapshot.upsert({
    where: { sourceKey },
    create: {
      sourceKey,
      snapshotDate: new Date(
        `${normalizedData.meta.snapshotDate}T00:00:00.000Z`,
      ),
      metadata: normalizedData.meta as Prisma.InputJsonValue,
    },
    update: {
      snapshotDate: new Date(
        `${normalizedData.meta.snapshotDate}T00:00:00.000Z`,
      ),
      status: 'STAGED',
      metadata: normalizedData.meta as Prisma.InputJsonValue,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.inventorySnapshotEntry.deleteMany({
      where: { snapshotId: snapshot.id },
    });
    await tx.inventorySnapshotArticle.deleteMany({
      where: { snapshotId: snapshot.id },
    });
    await tx.inventorySnapshotWarehouseMapping.deleteMany({
      where: { snapshotId: snapshot.id },
    });
    await tx.inventorySnapshotArticle.createMany({
      data: normalizedData.catalog.map((article) => ({
        snapshotId: snapshot.id,
        articleCode: article.articleCode,
        articleName: article.articleName,
        groupCode: article.groupCode,
        groupName: article.groupName,
        subgroupCode: article.subgroupCode ?? null,
        subgroupName: article.subgroupName ?? null,
        appearsInWarehouse: article.appearsInWarehouse,
        appearsOnSite: article.appearsOnSite,
        appearsInSupplierInventory: article.appearsInSupplierInventory,
        unitWeight: article.unitWeight ?? null,
        suggestedControlType: article.suggestedControlType,
        classificationStatus: article.classificationStatus,
        observations: article.observations ?? null,
      })),
    });
    await tx.inventorySnapshotWarehouseMapping.createMany({
      data: normalizedData.warehouseMappings.map((mapping) => ({
        snapshotId: snapshot.id,
        legacyWarehouseCode: mapping.legacyWarehouseCode,
        mappedWarehouseName: mapping.mappedWarehouseName,
        warehouseType: mapping.warehouseType,
        ownerName: mapping.ownerName,
        appearsInOwnWarehouse: mapping.appearsInOwnWarehouse,
        appearsInOwnOnSite: mapping.appearsInOwnOnSite,
        appearsInSupplierInventory: mapping.appearsInSupplierInventory,
        sourceRows: mapping.sourceRows,
        mappingStatus: mapping.mappingStatus,
        observations: mapping.observations,
      })),
    });
    await tx.inventorySnapshotEntry.createMany({
      data: entries.map((entry) => ({ snapshotId: snapshot.id, ...entry })),
    });
  });

  const [articleCount, mappingCount, entryCount, ledgerAfter] =
    await Promise.all([
      prisma.inventorySnapshotArticle.count({
        where: { snapshotId: snapshot.id },
      }),
      prisma.inventorySnapshotWarehouseMapping.count({
        where: { snapshotId: snapshot.id },
      }),
      prisma.inventorySnapshotEntry.count({
        where: { snapshotId: snapshot.id },
      }),
      prisma.stockLedger.count(),
    ]);

  if (
    articleCount !== normalizedData.catalog.length ||
    mappingCount !== normalizedData.warehouseMappings.length ||
    entryCount !== entries.length ||
    ledgerAfter !== ledgerBefore
  ) {
    throw new Error(
      'La verificación posterior no coincide con los totales esperados.',
    );
  }

  console.log({
    imported: true,
    status: snapshot.status,
    articleCount,
    mappingCount,
    entryCount,
    stockLedgerRowsAfter: ledgerAfter,
    operationalLedgerChanged: ledgerAfter !== ledgerBefore,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
