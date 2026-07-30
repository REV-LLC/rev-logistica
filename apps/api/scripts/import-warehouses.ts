import { Prisma, PrismaClient, WarehouseType } from '@prisma/client';
import { loadJsonFile } from './load-json-file';

const normalizedData = loadJsonFile<any>(
  'warehouses.normalized.json',
  '--warehouses-file',
);
const snapshotData = loadJsonFile<any>(
  'inventory-snapshot-2026-07-24.normalized.json',
  '--snapshot-file',
);
const prisma = new PrismaClient();
const apply = process.argv.slice(2).includes('--apply');
const sourceKey = 'INVENTORY_2026_07_24';
const isOperationalOwn = (legacyWarehouseCode: string) =>
  legacyWarehouseCode === '1';

async function main() {
  const warehouses = normalizedData.warehouses;
  const warehouseCodes = warehouses.map(
    (warehouse) => warehouse.legacyWarehouseCode,
  );
  const warehouseByCode = new Map<string, any>(
    warehouses.map((warehouse) => [warehouse.legacyWarehouseCode, warehouse]),
  );
  const snapshotCodes = snapshotData.warehouseMappings.map(
    (mapping) => mapping.legacyWarehouseCode,
  );
  const missingSnapshotCodes = snapshotCodes.filter(
    (code) => !warehouseByCode.has(code),
  );
  if (missingSnapshotCodes.length) {
    throw new Error(
      `El maestro no contiene códigos usados por el snapshot: ${missingSnapshotCodes.join(', ')}`,
    );
  }

  const [snapshot, references, currentWarehouses, owners, ledgerBefore] =
    await Promise.all([
      prisma.inventorySnapshot.findUnique({
        where: { sourceKey },
        select: { id: true },
      }),
      prisma.legacyWarehouse.findMany({
        where: { code: { in: warehouseCodes } },
        select: { code: true, operationalWarehouseId: true },
      }),
      prisma.warehouse.findMany({
        select: {
          id: true,
          type: true,
          ownerCompanyId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.owner.findMany({ select: { id: true, name: true } }),
      prisma.stockLedger.count(),
    ]);
  if (!snapshot) {
    throw new Error(`Snapshot no encontrado: ${sourceKey}`);
  }

  const primaryReference = references.find(
    (reference) => reference.code === '1',
  );
  const primaryWarehouse =
    currentWarehouses.find(
      (warehouse) => warehouse.id === primaryReference?.operationalWarehouseId,
    ) ??
    currentWarehouses.find((warehouse) => warehouse.type === WarehouseType.OWN);
  if (!primaryWarehouse) {
    throw new Error(
      'No existe una bodega propia principal para vincular el código 1.',
    );
  }

  const existingOperationalLinks = references.filter(
    (reference) => reference.operationalWarehouseId,
  ).length;
  const existingOwnerNames = new Set(
    owners.map((owner) => owner.name.toLowerCase()),
  );
  const allyOwnerNames = warehouses
    .filter((warehouse) => !isOperationalOwn(warehouse.legacyWarehouseCode))
    .map((warehouse) => warehouse.name.toLowerCase());
  const ownerCreates = allyOwnerNames.filter(
    (name) => !existingOwnerNames.has(name),
  ).length;
  const reusesPrimaryWarehouse = !primaryReference?.operationalWarehouseId;
  const operationalWarehouseCreates =
    warehouses.length -
    existingOperationalLinks -
    (reusesPrimaryWarehouse ? 1 : 0);

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    sourceRows: warehouses.length,
    uniqueCodes: new Set(warehouseCodes).size,
    referenceCreates: warehouses.length - references.length,
    existingOperationalLinks,
    operationalWarehouseCreates,
    ownerCreates,
    ownWarehouses: warehouses.filter((warehouse) =>
      isOperationalOwn(warehouse.legacyWarehouseCode),
    ).length,
    allyWarehouses: warehouses.filter(
      (warehouse) => !isOperationalOwn(warehouse.legacyWarehouseCode),
    ).length,
    snapshotCodes: snapshotCodes.length,
    missingSnapshotCodes,
    stockLedgerRowsBefore: ledgerBefore,
  });

  if (!apply) {
    console.log(
      'Vista previa únicamente. Usa --apply para crear y vincular las bodegas operativas.',
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const warehouse of warehouses) {
        const referenceData = {
          branchCode: warehouse.branchCode,
          name: warehouse.name,
          alternateCode: warehouse.alternateCode,
          occupancyEnabled: warehouse.occupancyEnabled,
          sourceOwnFlag: warehouse.sourceOwnFlag,
          inventoryCode: warehouse.inventoryCode,
          costCenterCode: warehouse.costCenterCode,
          active: warehouse.active,
          sourceCreatedAt: warehouse.sourceCreatedAt,
          sourceCreatedBy: warehouse.sourceCreatedBy,
          sourceUpdatedAt: warehouse.sourceUpdatedAt,
          sourceUpdatedBy: warehouse.sourceUpdatedBy,
        };
        await tx.legacyWarehouse.upsert({
          where: { code: warehouse.legacyWarehouseCode },
          create: {
            code: warehouse.legacyWarehouseCode,
            ...referenceData,
          },
          update: referenceData,
        });
      }

      const referenceRows = await tx.legacyWarehouse.findMany({
        where: { code: { in: warehouseCodes } },
        select: { code: true, operationalWarehouseId: true },
      });
      const referenceByCode = new Map(
        referenceRows.map((reference) => [reference.code, reference]),
      );
      const ownerByName = new Map(
        owners.map((owner) => [owner.name.toLowerCase(), owner.id]),
      );
      const operationalWarehouseByCode = new Map<string, string>();

      for (const warehouse of warehouses) {
        const type = isOperationalOwn(warehouse.legacyWarehouseCode)
          ? WarehouseType.OWN
          : WarehouseType.ALLY;
        let ownerCompanyId = primaryWarehouse.ownerCompanyId;
        if (type === WarehouseType.ALLY) {
          const ownerKey = warehouse.name.toLowerCase();
          ownerCompanyId = ownerByName.get(ownerKey) ?? '';
          if (!ownerCompanyId) {
            const owner = await tx.owner.create({
              data: { name: warehouse.name, active: true },
              select: { id: true },
            });
            ownerCompanyId = owner.id;
            ownerByName.set(ownerKey, owner.id);
          }
        }

        const reference = referenceByCode.get(warehouse.legacyWarehouseCode);
        let operationalWarehouseId = reference?.operationalWarehouseId ?? null;
        if (warehouse.legacyWarehouseCode === '1' && !operationalWarehouseId) {
          operationalWarehouseId = primaryWarehouse.id;
        }

        if (operationalWarehouseId) {
          await tx.warehouse.update({
            where: { id: operationalWarehouseId },
            data: {
              name: warehouse.name,
              type,
              ownerCompanyId,
              active: warehouse.active,
            },
          });
        } else {
          const operationalWarehouse = await tx.warehouse.create({
            data: {
              name: warehouse.name,
              type,
              ownerCompanyId,
              active: warehouse.active,
            },
            select: { id: true },
          });
          operationalWarehouseId = operationalWarehouse.id;
        }

        operationalWarehouseByCode.set(
          warehouse.legacyWarehouseCode,
          operationalWarehouseId,
        );
        await tx.legacyWarehouse.update({
          where: { code: warehouse.legacyWarehouseCode },
          data: { operationalWarehouseId },
        });
      }

      for (const mapping of snapshotData.warehouseMappings) {
        const warehouse = warehouseByCode.get(mapping.legacyWarehouseCode);
        const operationalWarehouseId = operationalWarehouseByCode.get(
          mapping.legacyWarehouseCode,
        );
        if (!warehouse || !operationalWarehouseId) {
          throw new Error(
            `No se pudo vincular la bodega ${mapping.legacyWarehouseCode}.`,
          );
        }
        const type = isOperationalOwn(mapping.legacyWarehouseCode)
          ? WarehouseType.OWN
          : WarehouseType.ALLY;
        const ownerName =
          type === WarehouseType.OWN
            ? (owners.find(
                (owner) => owner.id === primaryWarehouse.ownerCompanyId,
              )?.name ?? 'Renta Equipos del Valle S.A.S')
            : warehouse.name;

        await tx.inventorySnapshotWarehouseMapping.update({
          where: {
            snapshotId_legacyWarehouseCode: {
              snapshotId: snapshot.id,
              legacyWarehouseCode: mapping.legacyWarehouseCode,
            },
          },
          data: {
            mappedWarehouseName: warehouse.name,
            warehouseType: type,
            ownerName,
            mappingStatus: 'LISTO',
            observations:
              'Nombre, tipo y propietario vinculados con la bodega operativa.',
          },
        });
        await tx.inventorySnapshotEntry.updateMany({
          where: {
            snapshotId: snapshot.id,
            legacyWarehouseCode: mapping.legacyWarehouseCode,
          },
          data: {
            warehouseId: operationalWarehouseId,
            warehouseMappingStatus: 'LISTO',
            importStatus: 'PENDIENTE_CLASIFICACION_ARTICULOS',
            observations:
              'Bodega operativa vinculada; pendiente clasificación de artículos.',
          },
        });
      }

      await tx.inventorySnapshot.update({
        where: { id: snapshot.id },
        data: { metadata: snapshotData.meta as Prisma.InputJsonValue },
      });
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  const [
    linkedReferences,
    readyMappings,
    readyEntries,
    linkedEntries,
    ledgerAfter,
  ] = await Promise.all([
    prisma.legacyWarehouse.findMany({
      where: {
        code: { in: warehouseCodes },
        operationalWarehouseId: { not: null },
      },
      select: { operationalWarehouseId: true },
    }),
    prisma.inventorySnapshotWarehouseMapping.count({
      where: { snapshotId: snapshot.id, mappingStatus: 'LISTO' },
    }),
    prisma.inventorySnapshotEntry.count({
      where: { snapshotId: snapshot.id, warehouseMappingStatus: 'LISTO' },
    }),
    prisma.inventorySnapshotEntry.count({
      where: { snapshotId: snapshot.id, warehouseId: { not: null } },
    }),
    prisma.stockLedger.count(),
  ]);
  const expectedEntries =
    snapshotData.meta.totals.ownWarehouseRows +
    snapshotData.meta.totals.ownOnSiteRows +
    snapshotData.meta.totals.supplierRows;
  const linkedWarehouseIds = new Set(
    linkedReferences.map((reference) => reference.operationalWarehouseId),
  );
  const [ownWarehouseCount, allyWarehouseCount] = await Promise.all([
    prisma.warehouse.count({
      where: {
        id: { in: [...linkedWarehouseIds] as string[] },
        type: WarehouseType.OWN,
      },
    }),
    prisma.warehouse.count({
      where: {
        id: { in: [...linkedWarehouseIds] as string[] },
        type: WarehouseType.ALLY,
      },
    }),
  ]);

  if (
    linkedReferences.length !== warehouses.length ||
    linkedWarehouseIds.size !== warehouses.length ||
    readyMappings !== snapshotCodes.length ||
    readyEntries !== expectedEntries ||
    linkedEntries !== expectedEntries ||
    ownWarehouseCount !== 1 ||
    allyWarehouseCount !== 24 ||
    ledgerAfter !== ledgerBefore
  ) {
    throw new Error(
      'La verificación posterior no coincide con los totales esperados.',
    );
  }

  console.log({
    imported: true,
    linkedReferences: linkedReferences.length,
    uniqueOperationalWarehouses: linkedWarehouseIds.size,
    readyMappings,
    readyEntries,
    linkedEntries,
    ownWarehouseCount,
    allyWarehouseCount,
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
