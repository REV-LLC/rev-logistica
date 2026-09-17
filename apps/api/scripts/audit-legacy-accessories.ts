import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  discoverLegacyAccessoryFamilies,
  proposeLegacyDocumentParent,
} from '../src/accessories/legacy-accessory-audit';

// Deliberately separate from DATABASE_URL: this audit runs on a restored snapshot.
// There is no --apply mode. Its proposals are not an executable migration plan.
async function main() {
  const connection = process.env.ACCESSORY_AUDIT_DATABASE_URL;
  if (!connection)
    throw new Error(
      'Configura ACCESSORY_AUDIT_DATABASE_URL con la copia local restaurada.',
    );
  const target = new URL(connection);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/^\/accessory_qa_[a-z0-9_]+$/.test(target.pathname)
  ) {
    throw new Error(
      'La auditoría solo admite localhost y una base accessory_qa_*.',
    );
  }
  const output = process.argv[2];
  if (!output || process.argv.length !== 3 || output.startsWith('-')) {
    throw new Error(
      'Uso: ts-node scripts/audit-legacy-accessories.ts /ruta/nueva/reporte.json',
    );
  }
  const prisma = new PrismaClient({ datasources: { db: { url: connection } } });
  try {
    const source = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '20s'`;
        const families = await tx.assetFamily.findMany({
          select: { id: true, code: true, name: true, controlType: true },
          orderBy: { id: 'asc' },
        });
        const rules = await tx.assetFamilyComponent.findMany({
          select: {
            id: true,
            parentAssetFamilyId: true,
            componentAssetFamilyId: true,
            active: true,
            required: true,
            minimumQuantity: true,
            maximumQuantity: true,
            exclusiveGroup: true,
          },
          orderBy: { id: 'asc' },
        });
        const candidates = discoverLegacyAccessoryFamilies(families, rules);
        const familyIds = candidates.map((candidate) => candidate.id);
        const skus = await tx.sku.findMany({
          where: { assetFamilyId: { in: familyIds } },
          select: {
            id: true,
            name: true,
            assetFamilyId: true,
            assetSubfamilyId: true,
            active: true,
            price: true,
            subrentalPrice: true,
            replacementValue: true,
            chargeType: true,
            minimumChargeHours: true,
            imageUrl: true,
            imageFileObjectId: true,
            size: true,
            lengthMeters: true,
            unitWeight: true,
            providerPrices: {
              select: { providerWarehouseId: true, price: true },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { id: 'asc' },
        });
        const skuIds = skus.map((sku) => sku.id);
        const assets = await tx.asset.findMany({
          where: { skuId: { in: skuIds } },
          select: {
            id: true,
            publicCode: true,
            skuId: true,
            warehouseOwnerId: true,
            warehouseCurrentId: true,
            description: true,
            serialOrEngine: true,
            registrationNumber: true,
            brand: true,
            model: true,
            year: true,
            fuel: true,
            weight: true,
            internalNumber: true,
            hourMeter: true,
            imageFileObjectId: true,
            active: true,
            deletedAt: true,
            kind: true,
            motorConfiguration: true,
            assignedMotorId: true,
            assignedToMixer: { select: { id: true, publicCode: true } },
            _count: {
              select: {
                mobilityGuides: true,
                maintenancePlans: true,
                hourReadings: true,
                assetFuelings: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        });
        const assetIds = assets.map((asset) => asset.id);
        const itemFilter = {
          OR: [{ skuId: { in: skuIds } }, { assetId: { in: assetIds } }],
        };
        const documents = await tx.document.findMany({
          where: { items: { some: itemFilter } },
          select: {
            id: true,
            consecutive: true,
            type: true,
            status: true,
            docDate: true,
            warehouseId: true,
            customerWorksiteId: true,
            items: {
              select: {
                id: true,
                assetId: true,
                skuId: true,
                quantity: true,
                requestedTag: true,
                componentParentAssetId: true,
                billingStatus: true,
                billingCutoffDate: true,
                returnedAt: true,
                asset: {
                  select: {
                    id: true,
                    publicCode: true,
                    sku: { select: { assetFamilyId: true } },
                  },
                },
                componentParentAsset: {
                  select: {
                    id: true,
                    publicCode: true,
                    sku: { select: { assetFamilyId: true } },
                  },
                },
              },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { id: 'asc' },
        });
        // jsonb preserves production's newer appendOrder without requiring the old generated client to know it.
        const ledger =
          skuIds.length || assetIds.length
            ? await tx.$queryRaw<{ row: Prisma.JsonObject }[]>(Prisma.sql`
          SELECT to_jsonb(l) AS row FROM "StockLedger" l
          WHERE l."skuId" IN (${skuIds.length ? Prisma.join(skuIds) : Prisma.sql`NULL`})
             OR l."assetId" IN (${assetIds.length ? Prisma.join(assetIds) : Prisma.sql`NULL`})
          ORDER BY l.id`)
            : [];
        const receipts = await tx.providerReceiptItem.findMany({
          where: itemFilter,
          select: {
            id: true,
            skuId: true,
            assetId: true,
            quantity: true,
            sourceDocumentId: true,
            sourceLedgerId: true,
            receiptDocument: {
              select: { id: true, consecutive: true, status: true },
            },
          },
          orderBy: { id: 'asc' },
        });
        const pickups = await tx.providerPickupItem.findMany({
          where: itemFilter,
          select: {
            id: true,
            skuId: true,
            assetId: true,
            quantity: true,
            documentId: true,
          },
          orderBy: { id: 'asc' },
        });
        const subfamilies = await tx.assetSubfamily.findMany({
          where: { assetFamilyId: { in: familyIds } },
          select: {
            id: true,
            assetFamilyId: true,
            code: true,
            name: true,
            active: true,
          },
          orderBy: { id: 'asc' },
        });
        const warehouses = await tx.warehouse.findMany({
          select: { id: true, name: true, type: true },
          orderBy: { id: 'asc' },
        });
        return {
          families,
          rules,
          candidates,
          skus,
          assets,
          subfamilies,
          documents,
          ledger: ledger.map((row) => row.row),
          receipts,
          pickups,
          warehouses,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 60000,
      },
    );

    const skuById = new Map(source.skus.map((sku) => [sku.id, sku]));
    const assetById = new Map(source.assets.map((asset) => [asset.id, asset]));
    const candidateById = new Map(
      source.candidates.map((candidate) => [candidate.id, candidate]),
    );
    const documentaryRelations = source.documents.flatMap((document) =>
      document.items.flatMap((item) => {
        const asset = item.assetId ? assetById.get(item.assetId) : undefined;
        const sku = skuById.get(asset?.skuId ?? item.skuId ?? '');
        const candidate = sku
          ? candidateById.get(sku.assetFamilyId)
          : undefined;
        if (
          !candidate ||
          candidate.disposition !== 'REVIEW_ACCESSORY_CONVERSION'
        )
          return [];
        const parent = item.componentParentAsset;
        return [
          {
            documentId: document.id,
            consecutive: document.consecutive,
            documentType: document.type,
            status: document.status,
            itemId: item.id,
            skuId: sku!.id,
            assetId: item.assetId,
            sourceName: sku!.name,
            quantity: item.quantity,
            sourceFamilyId: candidate.id,
            relationship: proposeLegacyDocumentParent({
              recordedParent: parent
                ? {
                    id: parent.id,
                    publicCode: parent.publicCode,
                    familyId: parent.sku.assetFamilyId,
                  }
                : null,
              compatibleFamilyIds: candidate.recordedParentFamilyIds,
              accessoryAssetId: item.assetId,
              documentAssets: document.items.flatMap((row) =>
                row.asset
                  ? [
                      {
                        id: row.asset.id,
                        publicCode: row.asset.publicCode,
                        familyId: row.asset.sku.assetFamilyId,
                      },
                    ]
                  : [],
              ),
            }),
          },
        ];
      }),
    );
    const summary = source.candidates.map((candidate) => {
      const skus = source.skus.filter(
        (sku) => sku.assetFamilyId === candidate.id,
      );
      const skuIds = new Set(skus.map((sku) => sku.id));
      const assets = source.assets.filter((asset) => skuIds.has(asset.skuId));
      const assetIds = new Set(assets.map((asset) => asset.id));
      const references = documentaryRelations.filter(
        (item) => item.sourceFamilyId === candidate.id,
      );
      const documentIds = new Set(
        source.documents
          .filter((doc) =>
            doc.items.some(
              (item) =>
                skuIds.has(item.skuId ?? '') ||
                assetIds.has(item.assetId ?? ''),
            ),
          )
          .map((doc) => doc.id),
      );
      return {
        familyId: candidate.id,
        code: candidate.normalizedCode,
        disposition: candidate.disposition,
        skus: skus.length,
        assets: assets.length,
        ledgerRows: source.ledger.filter(
          (row) =>
            skuIds.has(String(row.skuId)) || assetIds.has(String(row.assetId)),
        ).length,
        relatedDocuments: documentIds.size,
        pendingDocuments: source.documents
          .filter(
            (doc) =>
              documentIds.has(doc.id) &&
              ['DRAFT', 'IN_PROGRESS'].includes(doc.status),
          )
          .map((doc) => ({
            id: doc.id,
            consecutive: doc.consecutive,
            status: doc.status,
          })),
        nonzeroTariffSkus: skus
          .filter(
            (sku) =>
              Number(sku.price) > 0 ||
              Number(sku.subrentalPrice) > 0 ||
              sku.providerPrices.some((price) => Number(price.price) > 0),
          )
          .map((sku) => sku.id),
        pendingProviderReceipts: source.receipts
          .filter(
            (receipt) =>
              (skuIds.has(receipt.skuId ?? '') ||
                assetIds.has(receipt.assetId ?? '')) &&
              ['DRAFT', 'IN_PROGRESS'].includes(receipt.receiptDocument.status),
          )
          .map((receipt) => ({
            itemId: receipt.id,
            document: receipt.receiptDocument,
            quantity: receipt.quantity,
          })),
        missingParentReferences: references.filter(
          (item) => item.relationship.status !== 'RECORDED_PARENT',
        ).length,
        blockers: candidate.blockers,
      };
    });
    const report = {
      auditVersion: 1,
      generatedAt: new Date().toISOString(),
      database: target.pathname.slice(1),
      readOnly: true,
      conversionAuthorized: false,
      sourceFingerprint: createHash('sha256')
        .update(JSON.stringify(source))
        .digest('hex'),
      warnings: [
        'Propuestas de revisión: no autoriza conversiones ni modificaciones.',
        'BULK no significa consumible. No inventar identidades físicas ni compatibilidad.',
        'Las filas del ledger son historia, NO saldos migrables: resolver aperturas de catálogo, ON_SITE y transferencias con el modelo vigente de producción.',
        'No inferir una asignación solo porque el equipo y el accesorio aparecen en la misma remisión.',
        'No reescribir documentos confirmados, cortar cobros ni duplicar existencias para completar el empalme.',
        'Antes de ejecutar: conciliar borradores, retornos y recepciones pendientes; verificar de nuevo contra datos actuales.',
      ],
      summary,
      documentaryRelations,
      source,
    };
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        output,
        fingerprint: report.sourceFingerprint,
        families: summary.length,
        review: summary.filter(
          (row) => row.disposition === 'REVIEW_ACCESSORY_CONVERSION',
        ).length,
        preservedEquipment: summary.filter(
          (row) => row.disposition === 'PRESERVE_SPECIALIZED_EQUIPMENT',
        ).length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Do not print Prisma's initialization error: it can embed connection details.
  console.error(
    error instanceof Error && !/prisma/i.test(error.name)
      ? error.message
      : 'Falló la auditoría de la copia local; revisa conectividad y esquema.',
  );
  process.exitCode = 1;
});
