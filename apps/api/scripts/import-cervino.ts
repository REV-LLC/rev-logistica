import {
  DocumentStatus,
  DocumentType,
  MovementType,
  Prisma,
  PrismaClient,
  Role,
  SkuControlType,
  SkuUnit,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type CervinoSku = {
  externalCode?: string | null;
  name: string;
  trackingType: 'BULK' | 'SERIAL';
};

type CervinoAsset = {
  serialOrEngine: string;
  description?: string | null;
  skuExternalCode?: string | null;
  skuNameFallback?: string | null;
};

type CervinoAdjustment = {
  movementType: 'ADJUST';
  warehouseKey: string;
  itemType: 'BULK' | 'SERIAL';
  skuExternalCode?: string | null;
  skuNameFallback?: string | null;
  serialOrEngine?: string | null;
  quantity: number;
};

type CervinoInput = {
  meta?: { generatedAt?: string | null };
  skus: CervinoSku[];
  assets: CervinoAsset[];
  initialLedgerAdjustments: CervinoAdjustment[];
};

type Summary = {
  skusCreated: number;
  skusExisting: number;
  assetsCreated: number;
  assetsExisting: number;
  ledgerCreated: number;
  ledgerSkipped: number;
  errors: { area: string; message: string; context?: Record<string, unknown> }[];
};

const DEFAULT_FILE = path.resolve(process.cwd(), 'cervino_inventory_cutover (1).json');
const DEFAULT_WAREHOUSE_NAME = process.env.CERVINO_MAIN_WAREHOUSE_NAME ?? 'Main Warehouse';

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function toDateOnly(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFamilyCode(value: string) {
  return value.trim().toUpperCase();
}

async function createAssetWithInternalNumber(
  tx: Prisma.TransactionClient,
  data: Omit<Prisma.AssetUncheckedCreateInput, 'internalNumber'> & { assetFamilyId: string },
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const latest = await tx.asset.findFirst({
      where: { assetFamilyId: data.assetFamilyId },
      orderBy: { internalNumber: 'desc' },
      select: { internalNumber: true },
    });

    const nextNumber = (latest?.internalNumber ?? 0) + 1;

    try {
      return await tx.asset.create({
        data: {
          ...data,
          internalNumber: nextNumber,
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        attempt < maxRetries
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to allocate internalNumber for asset family.');
}

async function main() {
  const filePath = getArgValue('--file') ?? process.env.CERVINO_JSON_PATH ?? DEFAULT_FILE;
  const warehouseIdArg = getArgValue('--warehouse-id') ?? process.env.CERVINO_MAIN_WAREHOUSE_ID;
  const warehouseNameArg = getArgValue('--warehouse-name') ?? DEFAULT_WAREHOUSE_NAME;
  const adminIdArg = getArgValue('--admin-id') ?? process.env.CERVINO_ADMIN_ID;
  const resetCutover = process.argv.includes('--reset-cutover');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Input JSON not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const input = JSON.parse(raw) as CervinoInput;

  if (!input?.skus || !input?.assets || !input?.initialLedgerAdjustments) {
    throw new Error('Invalid JSON structure: expected meta, skus, assets, initialLedgerAdjustments');
  }

  const prisma = new PrismaClient();
  const summary: Summary = {
    skusCreated: 0,
    skusExisting: 0,
    assetsCreated: 0,
    assetsExisting: 0,
    ledgerCreated: 0,
    ledgerSkipped: 0,
    errors: [],
  };

  const dateOnly = toDateOnly(input.meta?.generatedAt) ?? toDateOnly(new Date().toISOString());
  const batchKey = `CERVINO_CUTOVER_${dateOnly}`;

  await prisma.$transaction(async (tx) => {
    let warehouseId: string | null = null;

    if (warehouseIdArg) {
      const warehouse = await tx.warehouse.findUnique({
        where: { id: warehouseIdArg },
        select: { id: true, name: true },
      });
      if (!warehouse) {
        throw new Error(`Warehouse not found for id ${warehouseIdArg}`);
      }
      warehouseId = warehouse.id;
    } else {
      const warehouse = await tx.warehouse.findFirst({
        where: { name: { equals: warehouseNameArg, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (!warehouse) {
        throw new Error(
          `Warehouse not found for name "${warehouseNameArg}". Use --warehouse-id or --warehouse-name.`,
        );
      }
      warehouseId = warehouse.id;
    }

    const adminUser = adminIdArg
      ? await tx.user.findUnique({ where: { id: adminIdArg } })
      : await tx.user.findFirst({
          where: { role: Role.ADMIN, active: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!adminUser || adminUser.role !== Role.ADMIN) {
      throw new Error('Admin user not found. Use --admin-id or set CERVINO_ADMIN_ID.');
    }

    const skuByExternalCode = new Map<string, string>();
    const skuByName = new Map<string, string>();
    const skuNameById = new Map<string, string>();

    const batchDocument = await tx.document.findUnique({
      where: { consecutive: batchKey },
      select: { id: true, type: true },
    });

    let batchDocumentId = batchDocument?.id ?? null;
    let batchDocumentType = batchDocument?.type ?? null;

    if (resetCutover) {
      if (batchDocumentId) {
        await tx.stockLedger.deleteMany({
          where: {
            movementType: MovementType.ADJUST,
            warehouseId,
            refDocumentId: batchDocumentId,
          },
        });

        await tx.document.delete({
          where: { id: batchDocumentId },
        });
        batchDocumentId = null;
        batchDocumentType = null;
      }

      const serialsToDelete = input.assets
        .map((asset) => asset.serialOrEngine?.trim())
        .filter((serial): serial is string => !!serial);

      const skuNamesToDelete = input.skus
        .map((sku) => sku.name?.trim())
        .filter((name): name is string => !!name);

      const skuIdsToDelete = skuNamesToDelete.length
        ? (
            await tx.sku.findMany({
              where: { name: { in: skuNamesToDelete } },
              select: { id: true },
            })
          ).map((sku) => sku.id)
        : [];

      if (skuIdsToDelete.length || serialsToDelete.length) {
        const assetIdsToDelete = (
          await tx.asset.findMany({
            where: {
              OR: [
                skuIdsToDelete.length ? { skuId: { in: skuIdsToDelete } } : undefined,
                serialsToDelete.length ? { serialOrEngine: { in: serialsToDelete } } : undefined,
              ].filter(Boolean) as Prisma.AssetWhereInput[],
            },
            select: { id: true },
          })
        ).map((asset) => asset.id);

        if (assetIdsToDelete.length || skuIdsToDelete.length) {
          await tx.stockLedger.deleteMany({
            where: {
              OR: [
                assetIdsToDelete.length ? { assetId: { in: assetIdsToDelete } } : undefined,
                skuIdsToDelete.length ? { skuId: { in: skuIdsToDelete } } : undefined,
              ].filter(Boolean) as Prisma.StockLedgerWhereInput[],
            },
          });
        }

        if (assetIdsToDelete.length) {
          await tx.asset.deleteMany({
            where: { id: { in: assetIdsToDelete } },
          });
        }
      }

      if (skuIdsToDelete.length) {
        await tx.sku.deleteMany({
          where: { id: { in: skuIdsToDelete } },
        });
      }

      summary.skusCreated = 0;
      summary.skusExisting = 0;
      summary.assetsCreated = 0;
      summary.assetsExisting = 0;
      summary.ledgerCreated = 0;
      summary.ledgerSkipped = 0;
      summary.errors = [];
    }

    if (!batchDocumentId) {
      const customerWorksite = await tx.customerWorksite.findFirst({
        where: { active: true },
        select: { id: true },
      });

      if (!customerWorksite) {
        throw new Error('No active customer worksite found to attach batch document.');
      }

      const createdDocument = await tx.document.create({
        data: {
          type: DocumentType.RECEIPT,
          status: DocumentStatus.CONFIRMED,
          consecutive: batchKey,
          customerWorksiteId: customerWorksite.id,
          createdBy: adminUser.id,
          docDate: new Date(),
          notes: `Cutover batch ${batchKey}`,
        },
        select: { id: true, type: true },
      });

      batchDocumentId = createdDocument.id;
      batchDocumentType = createdDocument.type;
    }

    if (!batchDocumentId) {
      throw new Error('Failed to resolve batch document for cutover import.');
    }

    const existingFamilies = await tx.assetFamily.findMany({
      select: { id: true, code: true, name: true },
    });
    const assetFamilyByCode = new Map(existingFamilies.map((family) => [family.code, family]));
    const skuFamilyById = new Map<string, string>();

    for (const sku of input.skus) {
      const name = sku.name?.trim();
      if (!name) {
        summary.errors.push({ area: 'sku', message: 'Missing name', context: sku as never });
        continue;
      }

      const nameKey = normalizeName(name);
      if (skuByName.has(nameKey)) {
        if (sku.externalCode) {
          skuByExternalCode.set(String(sku.externalCode), skuByName.get(nameKey) as string);
        }
        continue;
      }

      const existing = await tx.sku.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true, assetFamilyId: true },
      });

      if (existing) {
        const familyCode = normalizeFamilyCode(name);
        let family = assetFamilyByCode.get(familyCode);
        if (!family) {
          family = await tx.assetFamily.create({
            data: { code: familyCode, name },
            select: { id: true, code: true, name: true },
          });
          assetFamilyByCode.set(family.code, family);
        }
        if (!existing.assetFamilyId) {
          await tx.sku.update({
            where: { id: existing.id },
            data: { assetFamilyId: family.id },
          });
          skuFamilyById.set(existing.id, family.id);
        } else {
          skuFamilyById.set(existing.id, existing.assetFamilyId);
        }

        skuByName.set(nameKey, existing.id);
        skuNameById.set(existing.id, name);
        if (sku.externalCode) {
          skuByExternalCode.set(String(sku.externalCode), existing.id);
        }
        summary.skusExisting += 1;
        continue;
      }

      let controlType: SkuControlType | null = null;
      if (sku.trackingType === 'SERIAL') {
        controlType = SkuControlType.SERIAL;
      } else if (sku.trackingType === 'BULK') {
        controlType = SkuControlType.BULK;
      }

      if (!controlType) {
        summary.errors.push({
          area: 'sku',
          message: 'Invalid trackingType',
          context: sku,
        });
        continue;
      }

      const familyCode = normalizeFamilyCode(name);
      let family = assetFamilyByCode.get(familyCode);
      if (!family) {
        family = await tx.assetFamily.create({
          data: { code: familyCode, name },
          select: { id: true, code: true, name: true },
        });
        assetFamilyByCode.set(family.code, family);
      }

      const created = await tx.sku.create({
        data: {
          name,
          unit: SkuUnit.UNIT,
          controlType,
          assetFamilyId: family.id,
          active: true,
        },
        select: { id: true },
      });

      skuByName.set(nameKey, created.id);
      skuFamilyById.set(created.id, family.id);
      skuNameById.set(created.id, name);
      if (sku.externalCode) {
        skuByExternalCode.set(String(sku.externalCode), created.id);
      }
      summary.skusCreated += 1;
    }

    const assetBySerial = new Map<string, string>();

    for (const asset of input.assets) {
      const serial = asset.serialOrEngine?.trim();
      if (!serial) {
        summary.errors.push({ area: 'asset', message: 'Missing serialOrEngine', context: asset });
        continue;
      }

      if (assetBySerial.has(serial)) {
        continue;
      }

      const skuId =
        (asset.skuExternalCode && skuByExternalCode.get(String(asset.skuExternalCode))) ||
        (asset.skuNameFallback && skuByName.get(normalizeName(asset.skuNameFallback)));

      if (!skuId) {
        summary.errors.push({
          area: 'asset',
          message: 'SKU not found for asset',
          context: asset,
        });
        continue;
      }

      const existing = await tx.asset.findFirst({
        where: { serialOrEngine: serial },
        select: { id: true, skuId: true },
      });

      if (existing) {
        assetBySerial.set(serial, existing.id);
        summary.assetsExisting += 1;
        if (existing.skuId !== skuId) {
          summary.errors.push({
            area: 'asset',
            message: 'Existing asset SKU differs from JSON',
            context: { serialOrEngine: serial, existingSkuId: existing.skuId, skuId },
          });
        }
        continue;
      }

      const description =
        asset.description ??
        asset.skuNameFallback ??
        skuNameById.get(skuId) ??
        null;

      const assetFamilyId = skuFamilyById.get(skuId);
      if (!assetFamilyId) {
        summary.errors.push({
          area: 'asset',
          message: 'Asset family missing for SKU',
          context: { serialOrEngine: serial, skuId },
        });
        continue;
      }

      const created = await createAssetWithInternalNumber(tx, {
        serialOrEngine: serial,
        description,
        skuId,
        assetFamilyId,
        warehouseOwnerId: warehouseId,
        warehouseCurrentId: warehouseId,
        active: true,
      });

      assetBySerial.set(serial, created.id);
      summary.assetsCreated += 1;
    }

    for (const adjustment of input.initialLedgerAdjustments) {
      if (adjustment.movementType !== 'ADJUST') {
        summary.errors.push({
          area: 'ledger',
          message: 'Movement type is not ADJUST',
          context: adjustment,
        });
        continue;
      }

      if (adjustment.warehouseKey !== 'MAIN') {
        summary.errors.push({
          area: 'ledger',
          message: 'Warehouse key is not MAIN',
          context: adjustment,
        });
        continue;
      }

      if (adjustment.itemType === 'BULK') {
        const skuId =
          (adjustment.skuExternalCode &&
            skuByExternalCode.get(String(adjustment.skuExternalCode))) ||
          (adjustment.skuNameFallback &&
            skuByName.get(normalizeName(adjustment.skuNameFallback)));

        if (!skuId) {
          summary.errors.push({
            area: 'ledger',
            message: 'SKU not found for ledger bulk adjustment',
            context: adjustment,
          });
          continue;
        }

        if (!adjustment.quantity || adjustment.quantity <= 0) {
          summary.errors.push({
            area: 'ledger',
            message: 'Invalid quantity for ledger bulk adjustment',
            context: adjustment,
          });
          continue;
        }

        const existing = await tx.stockLedger.findFirst({
          where: {
            movementType: MovementType.ADJUST,
            warehouseId,
            refDocumentId: batchDocumentId,
            skuId,
            quantity: new Prisma.Decimal(adjustment.quantity),
          },
          select: { id: true },
        });

        if (existing) {
          summary.ledgerSkipped += 1;
          continue;
        }

        await tx.stockLedger.create({
          data: {
            movementType: MovementType.ADJUST,
            warehouseId,
            customerWorksiteId: null,
            refDocumentId: batchDocumentId,
            refDocumentType: batchDocumentType,
            skuId,
            assetId: null,
            ownerWarehouseId: warehouseId,
            quantity: new Prisma.Decimal(adjustment.quantity),
            createdBy: adminUser.id,
          },
        });

        summary.ledgerCreated += 1;
        continue;
      }

      if (adjustment.itemType === 'SERIAL') {
        const serial = adjustment.serialOrEngine?.trim();
        if (!serial) {
          summary.errors.push({
            area: 'ledger',
            message: 'Missing serialOrEngine for serial adjustment',
            context: adjustment,
          });
          continue;
        }
        if (adjustment.quantity && adjustment.quantity !== 1) {
          summary.errors.push({
            area: 'ledger',
            message: 'Serial adjustment quantity must be 1',
            context: adjustment,
          });
          continue;
        }

        let assetId = assetBySerial.get(serial);
        if (!assetId) {
          const existingAsset = await tx.asset.findFirst({
            where: { serialOrEngine: serial },
            select: { id: true },
          });
          assetId = existingAsset?.id;
          if (assetId) {
            assetBySerial.set(serial, assetId);
          }
        }

        if (!assetId) {
          summary.errors.push({
            area: 'ledger',
            message: 'Asset not found for serial adjustment',
            context: adjustment,
          });
          continue;
        }

        const existing = await tx.stockLedger.findFirst({
          where: {
            movementType: MovementType.ADJUST,
            warehouseId,
            refDocumentId: batchDocumentId,
            assetId,
            quantity: new Prisma.Decimal(1),
          },
          select: { id: true },
        });

        if (existing) {
          summary.ledgerSkipped += 1;
          continue;
        }

        const assetOwner = await tx.asset.findUnique({
          where: { id: assetId },
          select: { warehouseOwnerId: true },
        });

        if (!assetOwner?.warehouseOwnerId) {
          summary.errors.push({
            area: 'ledger',
            message: 'Asset owner warehouse not found',
            context: adjustment,
          });
          continue;
        }

        await tx.stockLedger.create({
          data: {
            movementType: MovementType.ADJUST,
            warehouseId,
            customerWorksiteId: null,
            refDocumentId: batchDocumentId,
            refDocumentType: batchDocumentType,
            skuId: null,
            assetId,
            ownerWarehouseId: assetOwner.warehouseOwnerId,
            quantity: new Prisma.Decimal(1),
            createdBy: adminUser.id,
          },
        });

        summary.ledgerCreated += 1;
        continue;
      }

      summary.errors.push({
        area: 'ledger',
        message: 'Unknown itemType',
        context: adjustment,
      });
    }
  });

  await prisma.$disconnect();

  console.log('Cervino cutover import summary');
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) {
    console.warn('Warnings: some rows were skipped. Review errors in summary.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
