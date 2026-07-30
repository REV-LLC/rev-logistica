import {
  DocumentStatus,
  DocumentType,
  InventorySnapshotDestinationType,
  InventorySnapshotOwnershipType,
  InventorySnapshotStatus,
  MovementType,
  Prisma,
  PrismaClient,
  Role,
  SkuControlType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { loadJsonFile } from './load-json-file';

type JsonRecord = Record<string, any>;
type CatalogDescriptor = {
  family: string;
  subfamily: string | null;
  skuName: string;
  controlType: SkuControlType;
  candidateSkuId?: string | null;
  size?: string | null;
  lengthMeters?: number | null;
  closedLengthMeters?: number | null;
  extendedLengthMeters?: number | null;
  unitWeight?: number | null;
};
type DesiredAsset = {
  descriptor: CatalogDescriptor;
  ownerWarehouseId: string;
  currentWarehouseId: string | null;
  customerWorksiteId: string | null;
  internalNumber: number | null;
  candidateAssetId: string | null;
  candidateSkuId: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel: string | null;
  source: string;
};

const catalogData = loadJsonFile<JsonRecord>(
  'catalog-mapping-final.json',
  '--catalog-file',
);
const assetRules = loadJsonFile<JsonRecord>(
  'asset-import-rules.json',
  '--asset-rules-file',
);
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const replace = process.argv.includes('--replace');
const sourceKey = 'INVENTORY_2026_07_29';
const cutoverConsecutive = 'CUTOVER-INVENTORY-2026-07-29';
const cutoverDate = new Date('2026-07-29T23:59:59.000Z');

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function code(value: string) {
  return normalize(value).replace(/ /g, '_').slice(0, 60) || 'ESTANDAR';
}

function shortHash(value: string) {
  return createHash('sha1')
    .update(value)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
}

function explicitValue(source: JsonRecord, keys: string[], fallback: unknown) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return fallback;
}

function descriptorKey(input: CatalogDescriptor) {
  return [
    normalize(input.family),
    normalize(input.subfamily),
    normalize(input.skuName),
    input.controlType,
  ].join('|');
}

function relationKey(customerDocument?: string, worksiteExternalCode?: string) {
  return `${customerDocument ?? ''}|${worksiteExternalCode ?? ''}`;
}

function isImportable(mapping: JsonRecord) {
  if (
    !['CONFIRMADO_BULK', 'CONFIRMADO_SERIAL'].includes(
      mapping.classificationStatus,
    )
  ) {
    return false;
  }
  const action = String(mapping.finalAction ?? '');
  return !action.startsWith('OMITIR') && !action.startsWith('NO_IMPORTAR');
}

function mappingControlType(mapping: JsonRecord) {
  return mapping.classificationStatus === 'CONFIRMADO_SERIAL'
    ? SkuControlType.SERIAL
    : SkuControlType.BULK;
}

function descriptorFrom(
  mapping: JsonRecord,
  override: JsonRecord = {},
): CatalogDescriptor {
  const family =
    override.normalizedFamily ??
    override.family ??
    mapping.normalizedFamily ??
    mapping.finalSkuName;
  const skuName =
    override.finalSkuName ?? override.skuName ?? mapping.finalSkuName;
  if (!family || !skuName) {
    throw new Error(`Mapeo ${mapping.articleCode} sin familia o SKU final.`);
  }
  const overrideChangesSku =
    (override.finalSkuName || override.skuName) &&
    normalize(override.finalSkuName ?? override.skuName) !==
      normalize(mapping.finalSkuName);
  return {
    family,
    subfamily:
      override.normalizedSubfamily ??
      override.subfamily ??
      mapping.normalizedSubfamily ??
      null,
    skuName,
    controlType: mappingControlType(mapping),
    candidateSkuId:
      override.candidateSkuId ??
      (overrideChangesSku ? null : (mapping.candidateSkuId ?? null)),
    size: override.normalizedSize ?? mapping.normalizedSize ?? null,
    lengthMeters:
      override.normalizedLengthMeters ?? mapping.normalizedLengthMeters ?? null,
    closedLengthMeters:
      override.normalizedClosedLengthMeters ??
      mapping.normalizedClosedLengthMeters ??
      null,
    extendedLengthMeters:
      override.normalizedExtendedLengthMeters ??
      mapping.normalizedExtendedLengthMeters ??
      null,
    unitWeight:
      Number(override.unitWeight ?? mapping.unitWeight ?? 0) > 0
        ? Number(override.unitWeight ?? mapping.unitWeight)
        : null,
  };
}

function catalogDescriptors(mappings: JsonRecord[]) {
  const descriptors = new Map<string, CatalogDescriptor>();
  const add = (descriptor: CatalogDescriptor) =>
    descriptors.set(descriptorKey(descriptor), descriptor);

  for (const mapping of mappings.filter(isImportable)) {
    const physicalTargets = mapping.physicalAssetTargets ?? [];
    const resolvedAssets = mapping.resolvedAssets ?? [];
    if (!physicalTargets.length && !resolvedAssets.length) {
      add(descriptorFrom(mapping));
    }
    for (const target of [
      ...(mapping.contextualTargets ?? []),
      ...physicalTargets,
      ...resolvedAssets,
      ...(mapping.supplierAssets ?? []),
      ...(mapping.additionalConfirmedPhysicalAssets ?? []),
    ]) {
      add(descriptorFrom(mapping, target));
    }
  }

  for (const addition of assetRules.manualInventoryAdditions as JsonRecord[]) {
    add({
      family: addition.family,
      subfamily: addition.subfamily ?? null,
      skuName: addition.skuName,
      controlType: SkuControlType.SERIAL,
      size: addition.size ?? null,
      lengthMeters: addition.lengthMeters ?? null,
    });
  }
  return descriptors;
}

function matchingContextTarget(
  mapping: JsonRecord,
  ownershipType: InventorySnapshotOwnershipType,
  destinationType: InventorySnapshotDestinationType,
) {
  return (mapping.contextualTargets ?? []).find((target: JsonRecord) => {
    if (target.scope === ownershipType) return true;
    if (
      target.scope === 'OWN_WAREHOUSE' &&
      ownershipType === InventorySnapshotOwnershipType.OWN &&
      destinationType === InventorySnapshotDestinationType.WAREHOUSE
    ) {
      return true;
    }
    if (
      target.scope === 'SUPPLIER_OR_MATCHED_ONSITE' &&
      ownershipType === InventorySnapshotOwnershipType.SUPPLIER
    ) {
      return true;
    }
    return (
      target.ownershipType === ownershipType &&
      (!target.destinationType || target.destinationType === destinationType)
    );
  });
}

async function main() {
  const mappings = catalogData.mappings as JsonRecord[];
  const mappingByArticle = new Map(
    mappings.map((mapping) => [String(mapping.articleCode), mapping]),
  );
  const descriptors = catalogDescriptors(mappings);
  const snapshot = await prisma.inventorySnapshot.findUnique({
    where: { sourceKey },
    include: {
      entries: {
        include: {
          customerWorksite: {
            include: {
              customer: { select: { nitOrId: true } },
              worksite: { select: { externalCode: true } },
            },
          },
        },
      },
    },
  });
  if (!snapshot) throw new Error(`Snapshot ${sourceKey} no encontrado.`);

  const positiveEntries = snapshot.entries.filter(
    (entry) => Number(entry.finalBalance) > 0,
  );
  const includedEntries = positiveEntries.filter((entry) =>
    isImportable(mappingByArticle.get(entry.articleCode) ?? {}),
  );
  const serialEntries = includedEntries.filter(
    (entry) =>
      mappingControlType(mappingByArticle.get(entry.articleCode)!) ===
      SkuControlType.SERIAL,
  );
  const invalidSerialQuantities = serialEntries.filter(
    (entry) => !Number.isInteger(Number(entry.finalBalance)),
  );
  const missingWarehouseLinks = (
    await prisma.legacyWarehouse.findMany({
      where: {
        code: {
          in: [
            ...new Set(
              includedEntries.map((entry) => entry.legacyWarehouseCode),
            ),
          ],
        },
      },
      select: { code: true, operationalWarehouseId: true },
    })
  ).filter((warehouse) => !warehouse.operationalWarehouseId);
  const missingRelations = includedEntries.filter(
    (entry) =>
      entry.destinationType === InventorySnapshotDestinationType.WORKSITE &&
      !entry.customerWorksiteId,
  );

  const existingDocument = await prisma.document.findUnique({
    where: { consecutive: cutoverConsecutive },
    select: { id: true },
  });

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    sourceKey,
    snapshotStatus: snapshot.status,
    catalogDescriptors: descriptors.size,
    positiveSourceRows: positiveEntries.length,
    includedSourceRows: includedEntries.length,
    excludedSourceRows: positiveEntries.length - includedEntries.length,
    bulkSourceRows: includedEntries.length - serialEntries.length,
    serialSourceRows: serialEntries.length,
    invalidSerialQuantities: invalidSerialQuantities.length,
    missingWarehouseLinks: missingWarehouseLinks.length,
    missingWorksiteRelations: missingRelations.length,
    manualAssetAdditions: (
      assetRules.manualInventoryAdditions as JsonRecord[]
    ).reduce((total, addition) => total + Number(addition.quantity ?? 0), 0),
    existingCutoverDocument: !!existingDocument,
    replaceExistingCutover: replace,
  });

  if (
    invalidSerialQuantities.length ||
    missingWarehouseLinks.length ||
    missingRelations.length
  ) {
    throw new Error(
      'El preflight del corte encontró vínculos o cantidades inválidas.',
    );
  }
  if (!apply) {
    console.log(
      'Preflight correcto. Usa --apply para publicar el corte local.',
    );
    return;
  }
  if (
    snapshot.status === InventorySnapshotStatus.POSTED &&
    existingDocument &&
    !replace
  ) {
    console.log('El corte ya está publicado; no se realizaron cambios.');
    return;
  }
  if (existingDocument && !replace) {
    throw new Error(
      `Ya existe ${cutoverConsecutive} pero el snapshot no está POSTED.`,
    );
  }

  const heartbeat = setInterval(() => {
    console.log('Corte en progreso; la transacción sigue activa.');
  }, 5_000);
  const result = await prisma
    .$transaction(
      async (tx) => {
        const admin = await tx.user.findFirst({
          where: { role: Role.ADMIN, active: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (!admin)
          throw new Error('No hay usuario ADMIN activo para firmar el corte.');
        if (existingDocument && replace) {
          await tx.stockLedger.deleteMany({
            where: { refDocumentId: existingDocument.id },
          });
          await tx.document.delete({ where: { id: existingDocument.id } });
          await tx.inventorySnapshot.update({
            where: { id: snapshot.id },
            data: { status: InventorySnapshotStatus.STAGED },
          });
        }

        const warehouses = await tx.warehouse.findMany({
          select: { id: true, name: true },
        });
        const warehouseByName = new Map(
          warehouses.map((warehouse) => [
            normalize(warehouse.name),
            warehouse.id,
          ]),
        );
        const legacyWarehouses = await tx.legacyWarehouse.findMany({
          select: { code: true, operationalWarehouseId: true },
        });
        const warehouseByLegacyCode = new Map(
          legacyWarehouses.map((warehouse) => [
            warehouse.code,
            warehouse.operationalWarehouseId,
          ]),
        );
        const ownWarehouseId = warehouseByLegacyCode.get('1');
        if (!ownWarehouseId)
          throw new Error('La bodega propia código 1 no está vinculada.');

        const relations = await tx.customerWorksite.findMany({
          select: {
            id: true,
            customer: { select: { nitOrId: true } },
            worksite: { select: { externalCode: true } },
          },
        });
        const relationByKey = new Map(
          relations.map((relation) => [
            relationKey(
              relation.customer.nitOrId ?? undefined,
              relation.worksite.externalCode ?? undefined,
            ),
            relation.id,
          ]),
        );

        const existingFamilies = await tx.assetFamily.findMany();
        const familyByName = new Map(
          existingFamilies.map((family) => [normalize(family.name), family]),
        );
        const familyByCode = new Map(
          existingFamilies.map((family) => [family.code, family]),
        );
        const familyByDescriptor = new Map<string, { id: string }>();
        let familiesCreated = 0;
        let subfamiliesCreated = 0;
        let skusCreated = 0;
        let skusReused = 0;

        for (const descriptor of descriptors.values()) {
          const familyKey = `${normalize(descriptor.family)}|${descriptor.controlType}`;
          if (familyByDescriptor.has(familyKey)) continue;
          let family = familyByName.get(normalize(descriptor.family));
          if (family && family.controlType !== descriptor.controlType) {
            throw new Error(
              `La familia ${descriptor.family} mezcla ${family.controlType} y ${descriptor.controlType}.`,
            );
          }
          if (!family) {
            let familyCode = code(descriptor.family);
            const codeOwner = familyByCode.get(familyCode);
            if (
              codeOwner &&
              normalize(codeOwner.name) !== normalize(descriptor.family)
            ) {
              familyCode = `${familyCode}_${descriptor.controlType}`.slice(
                0,
                60,
              );
            }
            family = await tx.assetFamily.create({
              data: {
                code: familyCode,
                name: descriptor.family,
                controlType: descriptor.controlType,
              },
            });
            familyByName.set(normalize(family.name), family);
            familyByCode.set(family.code, family);
            familiesCreated += 1;
          }
          familyByDescriptor.set(familyKey, family);
        }

        const subfamilyByDescriptor = new Map<string, { id: string }>();
        for (const descriptor of descriptors.values()) {
          if (!descriptor.subfamily) continue;
          const family = familyByDescriptor.get(
            `${normalize(descriptor.family)}|${descriptor.controlType}`,
          )!;
          const key = `${family.id}|${normalize(descriptor.subfamily)}`;
          if (subfamilyByDescriptor.has(key)) continue;
          let subfamily = await tx.assetSubfamily.findFirst({
            where: {
              assetFamilyId: family.id,
              name: { equals: descriptor.subfamily, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (!subfamily) {
            subfamily = await tx.assetSubfamily.create({
              data: {
                assetFamilyId: family.id,
                code: code(descriptor.subfamily),
                name: descriptor.subfamily,
                active: true,
              },
              select: { id: true },
            });
            subfamiliesCreated += 1;
          }
          subfamilyByDescriptor.set(key, subfamily);
        }

        const skuByDescriptor = new Map<
          string,
          { id: string; assetSubfamilyId: string | null }
        >();
        for (const descriptor of descriptors.values()) {
          const family = familyByDescriptor.get(
            `${normalize(descriptor.family)}|${descriptor.controlType}`,
          )!;
          const subfamilyId = descriptor.subfamily
            ? subfamilyByDescriptor.get(
                `${family.id}|${normalize(descriptor.subfamily)}`,
              )!.id
            : null;
          let sku = descriptor.candidateSkuId
            ? await tx.sku.findUnique({
                where: { id: descriptor.candidateSkuId },
                select: { id: true },
              })
            : null;
          if (!sku) {
            sku = await tx.sku.findFirst({
              where: {
                assetFamilyId: family.id,
                name: { equals: descriptor.skuName, mode: 'insensitive' },
              },
              select: { id: true },
            });
          }
          const data = {
            name: descriptor.skuName,
            assetFamilyId: family.id,
            assetSubfamilyId: subfamilyId,
            size: descriptor.size,
            lengthMeters: descriptor.lengthMeters,
            closedLengthMeters: descriptor.closedLengthMeters,
            extendedLengthMeters: descriptor.extendedLengthMeters,
            unitWeight: descriptor.unitWeight,
            active: true,
          };
          if (sku) {
            await tx.sku.update({ where: { id: sku.id }, data });
            skusReused += 1;
          } else {
            sku = await tx.sku.create({ data, select: { id: true } });
            skusCreated += 1;
          }
          skuByDescriptor.set(descriptorKey(descriptor), {
            id: sku.id,
            assetSubfamilyId: subfamilyId,
          });
        }

        const desiredBulk = new Map<
          string,
          {
            skuId: string;
            ownerWarehouseId: string;
            warehouseId: string | null;
            customerWorksiteId: string | null;
            quantity: number;
          }
        >();
        const addBulk = (
          skuId: string,
          ownerWarehouseId: string,
          warehouseId: string | null,
          customerWorksiteId: string | null,
          quantity: number,
        ) => {
          const key = [
            skuId,
            ownerWarehouseId,
            warehouseId ?? '',
            customerWorksiteId ?? '',
          ].join('|');
          const current = desiredBulk.get(key);
          if (current) current.quantity += quantity;
          else
            desiredBulk.set(key, {
              skuId,
              ownerWarehouseId,
              warehouseId,
              customerWorksiteId,
              quantity,
            });
        };

        for (const entry of includedEntries) {
          const mapping = mappingByArticle.get(entry.articleCode)!;
          if (mappingControlType(mapping) !== SkuControlType.BULK) continue;
          const descriptor = descriptorFrom(mapping);
          const sku = skuByDescriptor.get(descriptorKey(descriptor));
          if (!sku)
            throw new Error(`SKU BULK no resuelto: ${descriptor.skuName}`);
          const ownerWarehouseId = warehouseByLegacyCode.get(
            entry.legacyWarehouseCode,
          );
          if (!ownerWarehouseId) {
            throw new Error(
              `Bodega histórica ${entry.legacyWarehouseCode} sin vínculo.`,
            );
          }
          addBulk(
            sku.id,
            ownerWarehouseId,
            entry.destinationType === InventorySnapshotDestinationType.WAREHOUSE
              ? ownerWarehouseId
              : null,
            entry.customerWorksiteId,
            Number(entry.finalBalance),
          );
        }

        const desiredAssets: DesiredAsset[] = [];
        const targetToDesired = (
          mapping: JsonRecord,
          target: JsonRecord,
          source: string,
          fallback?: {
            ownershipType: InventorySnapshotOwnershipType;
            destinationType: InventorySnapshotDestinationType;
            legacyWarehouseCode: string;
            customerWorksiteId: string | null;
          },
        ) => {
          const descriptor = descriptorFrom(mapping, target);
          const targetChangesSku =
            (target.finalSkuName || target.skuName) &&
            normalize(target.finalSkuName ?? target.skuName) !==
              normalize(mapping.finalSkuName);
          const ownershipType =
            target.ownershipType ??
            fallback?.ownershipType ??
            mapping.ownershipType;
          let ownerWarehouseId: string | null = null;
          const ownerName =
            target.ownerWarehouseName ??
            target.ownerName ??
            mapping.ownerWarehouseName ??
            mapping.ownerName;
          if (ownerName)
            ownerWarehouseId =
              warehouseByName.get(normalize(ownerName)) ?? null;
          const legacyCode =
            target.warehouseExternalCode ??
            fallback?.legacyWarehouseCode ??
            mapping.warehouseExternalCode;
          if (!ownerWarehouseId && legacyCode) {
            ownerWarehouseId =
              warehouseByLegacyCode.get(String(legacyCode)) ?? null;
          }
          if (!ownerWarehouseId && ownershipType === 'OWN') {
            ownerWarehouseId = ownWarehouseId;
          }
          if (!ownerWarehouseId) {
            throw new Error(`Propietario no resuelto para ${source}.`);
          }
          const destinationType =
            target.destinationType ??
            fallback?.destinationType ??
            mapping.destinationType ??
            (target.currentWarehouseName || target.warehouseName
              ? 'WAREHOUSE'
              : undefined);
          let customerWorksiteId =
            destinationType === 'WORKSITE'
              ? (fallback?.customerWorksiteId ?? null)
              : null;
          if (destinationType === 'WORKSITE' && !customerWorksiteId) {
            customerWorksiteId =
              relationByKey.get(
                relationKey(
                  target.customerDocument ?? mapping.customerDocument,
                  target.worksiteExternalCode ?? mapping.worksiteExternalCode,
                ),
              ) ?? null;
          }
          if (destinationType === 'WORKSITE' && !customerWorksiteId) {
            throw new Error(`Obra no resuelta para ${source}.`);
          }
          const quantity = Number(
            target.initialLedgerQuantity ?? target.quantity ?? 1,
          );
          const explicitNumbers: Array<number | null> = target.internalNumbers
            ?.length
            ? target.internalNumbers.map(Number)
            : Array.from({ length: quantity }, (_, index) =>
                index === 0 && target.internalNumber != null
                  ? Number(target.internalNumber)
                  : null,
              );
          for (let index = 0; index < quantity; index += 1) {
            desiredAssets.push({
              descriptor,
              ownerWarehouseId,
              currentWarehouseId:
                destinationType === 'WAREHOUSE'
                  ? (warehouseByName.get(
                      normalize(
                        target.currentWarehouseName ??
                          target.warehouseName ??
                          ownerName ??
                          '',
                      ),
                    ) ?? ownerWarehouseId)
                  : null,
              customerWorksiteId,
              internalNumber: explicitNumbers[index] ?? null,
              candidateAssetId:
                target.candidateAssetId ??
                (targetChangesSku
                  ? null
                  : (mapping.candidateAssetId ?? null)),
              candidateSkuId:
                target.candidateSkuId ??
                (targetChangesSku ? null : (mapping.candidateSkuId ?? null)),
              brand: explicitValue(
                target,
                ['normalizedBrand', 'brand'],
                targetChangesSku ? null : (mapping.normalizedBrand ?? null),
              ) as string | null,
              model: explicitValue(
                target,
                ['normalizedModel', 'model'],
                targetChangesSku ? null : (mapping.normalizedModel ?? null),
              ) as string | null,
              year: explicitValue(
                target,
                ['normalizedYear', 'year'],
                targetChangesSku ? null : (mapping.normalizedYear ?? null),
              ) as number | null,
              fuel: explicitValue(
                target,
                ['normalizedFuel', 'fuel'],
                targetChangesSku ? null : (mapping.normalizedFuel ?? null),
              ) as string | null,
              source,
            });
          }
        };

        for (const mapping of mappings.filter(
          (entry) =>
            isImportable(entry) &&
            mappingControlType(entry) === SkuControlType.SERIAL,
        )) {
          const physicalTargets = mapping.physicalAssetTargets ?? [];
          const resolvedAssets = mapping.resolvedAssets ?? [];
          if (physicalTargets.length) {
            for (const [index, target] of physicalTargets.entries()) {
              targetToDesired(
                mapping,
                target,
                `article:${mapping.articleCode}:physical:${index}`,
              );
            }
          } else if (resolvedAssets.length) {
            for (const [index, target] of resolvedAssets.entries()) {
              targetToDesired(
                mapping,
                target,
                `article:${mapping.articleCode}:resolved:${index}`,
              );
            }
          } else {
            const hasSupplierOverrides =
              (mapping.supplierAssets ?? []).length > 0;
            const entries = includedEntries.filter(
              (entry) =>
                entry.articleCode === String(mapping.articleCode) &&
                (!hasSupplierOverrides ||
                  entry.ownershipType === InventorySnapshotOwnershipType.OWN),
            );
            let ownExplicitNumberUsed = false;
            for (const entry of entries) {
              const contextual =
                matchingContextTarget(
                  mapping,
                  entry.ownershipType,
                  entry.destinationType,
                ) ?? {};
              const quantity = Number(entry.finalBalance);
              for (let index = 0; index < quantity; index += 1) {
                const target = {
                  ...contextual,
                  ownershipType: entry.ownershipType,
                  destinationType: entry.destinationType,
                  initialLedgerQuantity: 1,
                  internalNumber:
                    entry.ownershipType ===
                      InventorySnapshotOwnershipType.OWN &&
                    !ownExplicitNumberUsed &&
                    (contextual.internalNumber ?? mapping.internalNumber) !=
                      null
                      ? Number(
                          contextual.internalNumber ?? mapping.internalNumber,
                        )
                      : null,
                };
                if (target.internalNumber != null) ownExplicitNumberUsed = true;
                targetToDesired(
                  mapping,
                  target,
                  `article:${mapping.articleCode}:snapshot:${entry.sourceType}:${entry.sourceRow}:${index}`,
                  {
                    ownershipType: entry.ownershipType,
                    destinationType: entry.destinationType,
                    legacyWarehouseCode: entry.legacyWarehouseCode,
                    customerWorksiteId: entry.customerWorksiteId,
                  },
                );
              }
            }
          }
          for (const [index, target] of (
            mapping.supplierAssets ?? []
          ).entries()) {
            targetToDesired(
              mapping,
              target,
              `article:${mapping.articleCode}:supplier:${index}`,
            );
          }
          for (const [index, target] of (
            mapping.additionalConfirmedPhysicalAssets ?? []
          ).entries()) {
            targetToDesired(
              mapping,
              target,
              `article:${mapping.articleCode}:additional:${index}`,
            );
          }
        }

        for (const [additionIndex, addition] of (
          assetRules.manualInventoryAdditions as JsonRecord[]
        ).entries()) {
          const mapping = {
            articleCode: `MANUAL-${additionIndex + 1}`,
            classificationStatus: 'CONFIRMADO_SERIAL',
            finalSkuName: addition.skuName,
            normalizedFamily: addition.family,
            normalizedSubfamily: addition.subfamily,
            normalizedSize: addition.size,
            normalizedLengthMeters: addition.lengthMeters,
            normalizedFuel: addition.fuel,
            ownershipType: addition.ownershipType,
            destinationType: addition.destinationType,
            warehouseExternalCode: addition.warehouseExternalCode,
            customerDocument: addition.customerDocument,
            worksiteExternalCode: addition.worksiteExternalCode,
          };
          targetToDesired(mapping, addition, `manual:${additionIndex + 1}`);
        }

        const existingAssets = await tx.asset.findMany({
          include: {
            sku: { select: { assetSubfamilyId: true } },
            _count: {
              select: {
                hourReadings: true,
                maintenancePlans: true,
                taskAssets: true,
                documentItems: true,
                mobilityGuides: true,
              },
            },
          },
        });
        const usedAssetIds = new Set<string>();
        const maxNumberByOwnerSubfamily = new Map<string, number>();
        for (const asset of existingAssets) {
          if (!asset.sku.assetSubfamilyId) continue;
          const key = `${asset.warehouseOwnerId}|${asset.sku.assetSubfamilyId}`;
          maxNumberByOwnerSubfamily.set(
            key,
            Math.max(
              maxNumberByOwnerSubfamily.get(key) ?? 0,
              asset.internalNumber,
            ),
          );
        }
        const resolvedAssets: Array<{
          id: string;
          skuId: string;
          ownerWarehouseId: string;
          warehouseId: string | null;
          customerWorksiteId: string | null;
        }> = [];
        let assetsCreated = 0;
        let assetsReused = 0;

        for (const target of desiredAssets) {
          const sku = skuByDescriptor.get(descriptorKey(target.descriptor));
          if (!sku?.assetSubfamilyId) {
            throw new Error(
              `SKU SERIAL sin subfamilia: ${target.descriptor.skuName}`,
            );
          }
          const canReclassify = (asset: (typeof existingAssets)[number]) =>
            !asset.imageFileObjectId &&
            asset._count.hourReadings === 0 &&
            asset._count.maintenancePlans === 0 &&
            asset._count.taskAssets === 0 &&
            asset._count.documentItems === 0 &&
            asset._count.mobilityGuides === 0;
          let existing = target.candidateAssetId
            ? existingAssets.find(
                (asset) =>
                  !usedAssetIds.has(asset.id) &&
                  asset.id === target.candidateAssetId &&
                  asset.warehouseOwnerId === target.ownerWarehouseId,
              )
            : undefined;
          if (
            !existing &&
            target.candidateSkuId &&
            target.internalNumber != null
          ) {
            existing = existingAssets.find(
              (asset) =>
                !usedAssetIds.has(asset.id) &&
                asset.skuId === target.candidateSkuId &&
                asset.warehouseOwnerId === target.ownerWarehouseId &&
                asset.internalNumber === target.internalNumber,
            );
          }
          if (
            !existing &&
            target.candidateSkuId &&
            target.internalNumber == null
          ) {
            existing = existingAssets.find(
              (asset) =>
                !usedAssetIds.has(asset.id) &&
                asset.skuId === target.candidateSkuId &&
                asset.warehouseOwnerId === target.ownerWarehouseId,
            );
          }
          if (!existing && target.internalNumber != null) {
            existing = existingAssets.find(
              (asset) =>
                !usedAssetIds.has(asset.id) &&
                asset.skuId === sku.id &&
                asset.warehouseOwnerId === target.ownerWarehouseId &&
                asset.internalNumber === target.internalNumber,
            );
          }
          if (!existing) {
            const sourceHash = shortHash(target.source);
            existing = existingAssets.find(
              (asset) =>
                !usedAssetIds.has(asset.id) &&
                asset.warehouseOwnerId === target.ownerWarehouseId &&
                asset.publicCode.startsWith('CUT-20260729-') &&
                asset.publicCode.endsWith(`-${sourceHash}`),
            );
          }
          if (!existing && target.internalNumber != null) {
            existing = existingAssets.find(
              (asset) =>
                !usedAssetIds.has(asset.id) &&
                canReclassify(asset) &&
                asset.warehouseOwnerId === target.ownerWarehouseId &&
                asset.sku.assetSubfamilyId === sku.assetSubfamilyId &&
                asset.internalNumber === target.internalNumber,
            );
          }
          const counterKey = `${target.ownerWarehouseId}|${sku.assetSubfamilyId}`;
          const internalNumber =
            target.internalNumber ??
            existing?.internalNumber ??
            (maxNumberByOwnerSubfamily.get(counterKey) ?? 0) + 1;
          maxNumberByOwnerSubfamily.set(
            counterKey,
            Math.max(
              maxNumberByOwnerSubfamily.get(counterKey) ?? 0,
              internalNumber,
            ),
          );

          let assetId: string;
          if (existing) {
            const updated = await tx.asset.update({
              where: { id: existing.id },
              data: {
                skuId: sku.id,
                internalNumber,
                brand: target.brand,
                model: target.model,
                year: target.year,
                fuel: target.fuel,
                description: target.descriptor.skuName,
                warehouseOwnerId: target.ownerWarehouseId,
                warehouseCurrentId: target.currentWarehouseId,
                active: true,
              },
              select: { id: true },
            });
            assetId = updated.id;
            assetsReused += 1;
          } else {
            const publicCode = [
              'CUT',
              '20260729',
              code(
                warehouses.find(
                  (warehouse) => warehouse.id === target.ownerWarehouseId,
                )?.name ?? target.ownerWarehouseId,
              ).slice(0, 18),
              code(target.descriptor.family).slice(0, 18),
              code(target.descriptor.subfamily ?? 'ESTANDAR').slice(0, 18),
              code(target.descriptor.skuName).slice(0, 18),
              String(internalNumber).padStart(3, '0'),
              shortHash(target.source),
            ].join('-');
            const created = await tx.asset.create({
              data: {
                skuId: sku.id,
                publicCode,
                serialOrEngine: null,
                description: target.descriptor.skuName,
                brand: target.brand,
                model: target.model,
                year: target.year,
                fuel: target.fuel,
                internalNumber,
                warehouseOwnerId: target.ownerWarehouseId,
                warehouseCurrentId: target.currentWarehouseId,
                active: true,
              },
              select: { id: true },
            });
            assetId = created.id;
            assetsCreated += 1;
          }
          usedAssetIds.add(assetId);
          resolvedAssets.push({
            id: assetId,
            skuId: sku.id,
            ownerWarehouseId: target.ownerWarehouseId,
            warehouseId: target.currentWarehouseId,
            customerWorksiteId: target.customerWorksiteId,
          });
        }

        for (const [ownerSubfamily, nextNumber] of maxNumberByOwnerSubfamily) {
          const [ownerWarehouseId, assetSubfamilyId] =
            ownerSubfamily.split('|');
          await tx.assetInternalCounter.upsert({
            where: {
              ownerWarehouseId_assetSubfamilyId: {
                ownerWarehouseId,
                assetSubfamilyId,
              },
            },
            create: {
              ownerWarehouseId,
              assetSubfamilyId,
              nextNumber: nextNumber + 1,
            },
            update: { nextNumber: nextNumber + 1 },
          });
        }

        const orphanAssetsRemoved = (
          await tx.asset.deleteMany({
            where: {
              publicCode: { startsWith: 'CUT-20260729-' },
              id: { notIn: [...usedAssetIds] },
              ledger: { none: {} },
            },
          })
        ).count;

        const document = await tx.document.create({
          data: {
            type: DocumentType.CUTOVER,
            status: DocumentStatus.CONFIRMED,
            consecutive: cutoverConsecutive,
            createdBy: admin.id,
            docDate: cutoverDate,
            notes: `Corte inicial publicado desde ${sourceKey}`,
            createdAt: cutoverDate,
          },
          select: { id: true, type: true },
        });

        type Position = {
          skuId: string | null;
          assetId: string | null;
          ownerWarehouseId: string;
          warehouseId: string | null;
          customerWorksiteId: string | null;
          quantity: number;
        };
        const positionKey = (position: Omit<Position, 'quantity'>) =>
          [
            position.skuId ? `S:${position.skuId}` : `A:${position.assetId}`,
            position.ownerWarehouseId,
            position.warehouseId ?? '',
            position.customerWorksiteId ?? '',
          ].join('|');
        const desiredPositions = new Map<string, Position>();
        for (const bulk of desiredBulk.values()) {
          const position = {
            skuId: bulk.skuId,
            assetId: null,
            ownerWarehouseId: bulk.ownerWarehouseId,
            warehouseId: bulk.warehouseId,
            customerWorksiteId: bulk.customerWorksiteId,
            quantity: bulk.quantity,
          };
          desiredPositions.set(positionKey(position), position);
        }
        for (const asset of resolvedAssets) {
          const position = {
            skuId: null,
            assetId: asset.id,
            ownerWarehouseId: asset.ownerWarehouseId,
            warehouseId: asset.warehouseId,
            customerWorksiteId: asset.customerWorksiteId,
            quantity: 1,
          };
          desiredPositions.set(positionKey(position), position);
        }

        const importedSkuIds = [
          ...new Set([...desiredBulk.values()].map((row) => row.skuId)),
        ];
        const importedAssetIds = resolvedAssets.map((asset) => asset.id);
        const currentRows = await tx.stockLedger.findMany({
          where: {
            OR: [
              importedSkuIds.length
                ? { skuId: { in: importedSkuIds } }
                : undefined,
              importedAssetIds.length
                ? { assetId: { in: importedAssetIds } }
                : undefined,
            ].filter(Boolean) as Prisma.StockLedgerWhereInput[],
          },
          select: {
            skuId: true,
            assetId: true,
            ownerWarehouseId: true,
            warehouseId: true,
            customerWorksiteId: true,
            movementType: true,
            quantity: true,
          },
        });
        const currentPositions = new Map<string, Position>();
        const addCurrentPosition = (
          position: Omit<Position, 'quantity'>,
          quantity: number,
        ) => {
          const key = positionKey(position);
          const current = currentPositions.get(key);
          if (current) current.quantity += quantity;
          else currentPositions.set(key, { ...position, quantity });
        };
        for (const row of currentRows) {
          const quantity = Number(row.quantity);

          // Mirror the inventory queries: every row with a warehouse contributes
          // to that warehouse, regardless of the originating worksite.
          if (row.warehouseId) {
            addCurrentPosition(
              {
                skuId: row.skuId,
                assetId: row.assetId,
                ownerWarehouseId: row.ownerWarehouseId,
                warehouseId: row.warehouseId,
                customerWorksiteId: null,
              },
              quantity,
            );
          }

          // On-site stock is the sum of rows without a warehouse minus returns
          // (IN rows). Historical returns can carry both warehouse and worksite,
          // so treating raw ledger coordinates as positions would subtract them
          // again after the snapshot cutover.
          if (row.customerWorksiteId && !row.warehouseId) {
            addCurrentPosition(
              {
                skuId: row.skuId,
                assetId: row.assetId,
                ownerWarehouseId: row.ownerWarehouseId,
                warehouseId: null,
                customerWorksiteId: row.customerWorksiteId,
              },
              quantity,
            );
          }
          if (
            row.customerWorksiteId &&
            row.movementType === MovementType.IN
          ) {
            addCurrentPosition(
              {
                skuId: row.skuId,
                assetId: row.assetId,
                ownerWarehouseId: row.ownerWarehouseId,
                warehouseId: null,
                customerWorksiteId: row.customerWorksiteId,
              },
              -quantity,
            );
          }
        }

        const allPositionKeys = new Set([
          ...desiredPositions.keys(),
          ...currentPositions.keys(),
        ]);
        let ledgerCreated = 0;
        for (const key of allPositionKeys) {
          const desired = desiredPositions.get(key);
          const current = currentPositions.get(key);
          const delta = (desired?.quantity ?? 0) - (current?.quantity ?? 0);
          if (Math.abs(delta) < 0.000001) continue;
          const position = desired ?? current!;
          await tx.stockLedger.create({
            data: {
              skuId: position.skuId,
              assetId: position.assetId,
              warehouseId: position.warehouseId,
              ownerWarehouseId: position.ownerWarehouseId,
              customerWorksiteId: position.customerWorksiteId,
              movementType: position.customerWorksiteId
                ? MovementType.ON_SITE
                : MovementType.ADJUST,
              quantity: new Prisma.Decimal(delta),
              refDocumentId: document.id,
              refDocumentType: document.type,
              createdAt: cutoverDate,
              createdBy: admin.id,
            },
          });
          ledgerCreated += 1;
        }

        await tx.inventorySnapshot.update({
          where: { id: snapshot.id },
          data: { status: InventorySnapshotStatus.POSTED },
        });

        return {
          familiesCreated,
          subfamiliesCreated,
          skusCreated,
          skusReused,
          desiredBulkPositions: desiredBulk.size,
          desiredSerialAssets: desiredAssets.length,
          assetsCreated,
          assetsReused,
          orphanAssetsRemoved,
          ledgerCreated,
          cutoverDocumentId: document.id,
        };
      },
      { timeout: 600_000 },
    )
    .finally(() => clearInterval(heartbeat));

  console.log({ posted: true, ...result });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
