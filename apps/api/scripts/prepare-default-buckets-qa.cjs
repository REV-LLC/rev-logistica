// One-time, user-confirmed opening inventory. Never a runtime rule for a family name.
// Dry run by default. --apply ONLY targets the isolated October 1 QA database.
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
require('./commercial-qa-target.cjs');
const { PrismaClient } = require('@prisma/client');
const {
  AccessoriesService,
} = require('../dist/src/accessories/accessories.service');
const {
  EquipmentConfigurationService,
} = require('../dist/src/accessories/equipment-configuration.service');
const {
  resolveLatestSerializedMovements,
} = require('../dist/src/inventory/serialized-ledger-location');
const { locationKey } = require('../dist/src/accessories/accessory-rules');
const {
  validateDocumentConfiguration,
} = require('../dist/src/accessories/document-configuration');
const {
  CommercialProfilesService,
} = require('../dist/src/commercial-profiles/commercial-profiles.service');
assert.equal(
  new URL(process.env.DATABASE_URL).pathname,
  '/equipment_configuration_qa_20261001',
);
const db = new PrismaClient();
const accessories = new AccessoriesService(db);
const configurations = new EquipmentConfigurationService(db, accessories);
const commercial = new CommercialProfilesService(db);
const approved = {
  familyId: 'bcac0419-f26f-476c-99a3-93a91f77ae99',
  existingParentId: '578d3f90-06f8-46b4-adb1-6d9a9ed56b76',
  existingBucketId: 'cc96d5fb-0abe-4773-8d0a-1fbd4dd59422',
};
function openingRequest(assetId) {
  const bytes = createHash('sha256')
    .update(`confirmed-default-bucket-20261001:${assetId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function rows(config) {
  return config.entries.map(
    ({
      id,
      role,
      assetId,
      accessoryId,
      familyId,
      quantity,
      maximumQuantity,
      required,
      defaultIncluded,
    }) => ({
      id,
      role,
      ...(assetId ? { assetId } : {}),
      ...(accessoryId ? { accessoryId } : {}),
      ...(familyId ? { familyId } : {}),
      quantity,
      maximumQuantity,
      required,
      defaultIncluded,
    }),
  );
}
(async () => {
  try {
    const actor = await db.user.findUniqueOrThrow({
      where: { email: 'qa-config-office@example.invalid' },
    });
    assert.equal(actor.role, 'OFFICE');
    const assets = await db.asset.findMany({
      where: {
        active: true,
        deletedAt: null,
        sku: { assetFamilyId: approved.familyId },
      },
      include: { sku: true, warehouseOwner: true },
    });
    assert.equal(
      assets.length,
      7,
      'Re-audit required: minicargador catalogue changed',
    );
    const history = await db.stockLedger.findMany({
      where: {
        assetId: { in: assets.map((a) => a.id) },
        reversedByDocumentId: null,
      },
    });
    const resolved = resolveLatestSerializedMovements(history);
    const plan = assets.map((asset) => {
      const location = resolved.get(asset.id)?.locationMovement;
      assert(location, `Unresolved custody: ${asset.publicCode}`);
      const onSite =
        ['OUT', 'ON_SITE'].includes(location.movementType) &&
        !!location.customerWorksiteId;
      const warehouseId = onSite
        ? null
        : (location.warehouseId ?? asset.warehouseCurrentId);
      assert(
        onSite || warehouseId,
        `Unknown physical warehouse: ${asset.publicCode}`,
      );
      return {
        asset,
        location: onSite
          ? {
              assetId: asset.id,
              customerWorksiteId: location.customerWorksiteId,
            }
          : { warehouseId },
        existing: asset.id === approved.existingParentId,
      };
    });
    if (!process.argv.includes('--apply')) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            newIndividualBuckets: 6,
            reusedBucket: approved.existingBucketId,
            plan: plan.map((p) => ({
              assetId: p.asset.id,
              equipment: p.asset.sku.name,
              number: p.asset.internalNumber,
              owner: p.asset.warehouseOwner.name,
              location: p.location,
              existing: p.existing,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    const report = [];
    await db.$transaction(
      async (tx) => {
        // Same topology → inventory lock order as live configuration writes.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0))::text`;
        for (const { asset, location, existing } of plan) {
          let target,
            code,
            created = false;
          if (existing) {
            const bucket = await tx.asset.findUniqueOrThrow({
              where: { id: approved.existingBucketId },
            });
            assert.equal(bucket.warehouseOwnerId, asset.warehouseOwnerId);
            target = { assetId: bucket.id };
            code = bucket.publicCode;
          } else {
            const requestId = openingRequest(asset.id);
            let bucket = await tx.accessory.findUnique({
              where: { creationRequestId: requestId },
            });
            if (!bucket) {
              bucket = await accessories.createInTransaction(
                tx,
                {
                  requestId,
                  purpose: 'ACCESSORY',
                  name: `BALDE ESTÁNDAR · ${asset.sku.name} #${asset.internalNumber}`,
                  description:
                    'Balde propio confirmado por el usuario para el empalme del 1 de octubre de 2026. Intercambiable como implemento; no es un componente exclusivo.',
                  kind: 'INDIVIDUAL',
                  familyId: asset.sku.assetFamilyId,
                  scope: 'ASSETS',
                  assetIds: [asset.id],
                  subfamilyIds: [],
                  ownerWarehouseId: asset.warehouseOwnerId,
                  warehouseId: location.warehouseId ?? asset.warehouseOwnerId,
                  quantity: 1,
                },
                actor.id,
              );
              // This is opening custody, NOT an invented dispatch from the owner's warehouse.
              // Amend the brand-new opening projection atomically, before anyone can see it.
              if (location.assetId) {
                await tx.accessoryBalance.updateMany({
                  where: { accessoryId: bucket.id },
                  data: {
                    warehouseId: null,
                    assetId: asset.id,
                    customerWorksiteId: location.customerWorksiteId,
                    locationKey: locationKey(location),
                  },
                });
              }
              await tx.accessoryMovement.update({
                where: { requestId },
                data: {
                  to: {
                    ...location,
                    label: `Balde de ${asset.sku.name} #${asset.internalNumber}`,
                  },
                  note: 'APERTURA DE EMPALME 2026-10-01: unidad existente confirmada por el usuario; custodia actual del minicargador. No es compra, entrega ni corrección de documentos históricos.',
                },
              });
              created = true;
            }
            assert.equal(bucket.kind, 'INDIVIDUAL');
            assert.equal(bucket.ownerWarehouseId, asset.warehouseOwnerId);
            assert.equal(
              await tx.accessoryAsset.count({
                where: { accessoryId: bucket.id, assetId: asset.id },
              }),
              1,
            );
            target = { accessoryId: bucket.id };
            code = bucket.internalCode;
          }
          const config = await tx.equipmentConfiguration.findUniqueOrThrow({
            where: { assetId: asset.id },
            include: { entries: { orderBy: { sortOrder: 'asc' } } },
          });
          const entries = rows(config);
          let entry = entries.find((row) =>
            target.assetId
              ? row.assetId === target.assetId
              : row.accessoryId === target.accessoryId,
          );
          const already =
            entry &&
            entry.defaultIncluded &&
            entry.required &&
            entry.quantity === 1 &&
            entry.maximumQuantity === 1;
          if (!already) {
            if (!entry) {
              entry = { id: randomUUID(), role: 'ACCESSORY', ...target };
              entries.push(entry);
            }
            Object.assign(entry, {
              quantity: 1,
              maximumQuantity: 1,
              defaultIncluded: true,
              required: true,
            });
            await configurations.saveInTransaction(
              tx,
              { assetId: asset.id },
              { version: config.version, notes: config.notes, entries },
              actor.id,
            );
          }
          report.push({
            assetId: asset.id,
            equipment: asset.sku.name,
            number: asset.internalNumber,
            owner: asset.warehouseOwner.name,
            bucket: target,
            code,
            created,
            location,
            defaultIncluded: true,
            required: true,
          });
        }
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );
    // Opening default buckets have explicit zero price; missing pricing is never treated as free.
    for (const item of report.filter((row) => row.bucket.accessoryId)) {
      const profile = await commercial.get(
        'ACCESSORY',
        item.bucket.accessoryId,
      );
      if (!profile.version)
        await commercial.save(
          {
            scopeType: 'ACCESSORY',
            scopeId: item.bucket.accessoryId,
            expectedVersion: 0,
            effectiveFrom: '2026-10-01',
            groups: [],
            modes: [
              {
                id: openingRequest(`mode:${item.assetId}`),
                name: 'Balde estándar incluido',
                unit: 'DAY',
                minimum: { value: '0', basis: 'PER_RENTAL' },
                pricing: { source: 'FIXED', amount: '0' },
                conditions: [],
                parts: [],
              },
            ],
          },
          actor.id,
        );
      else
        assert(
          profile.modes.length === 1 &&
            profile.modes[0].pricing.source === 'FIXED' &&
            Number(profile.modes[0].pricing.amount) === 0,
          'Existing bucket pricing changed; review it instead of overwriting',
        );
    }
    // Use the real generic document validator with persisted configuration. No documents are written.
    for (const item of report) {
      await db.$transaction(async (tx) => {
        await assert.rejects(
          () =>
            validateDocumentConfiguration(tx, {
              type: 'REMISSION',
              items: [{ assetId: item.assetId }],
            }),
          /requiere|necesita|Revisa/,
        );
        const items = [
          { assetId: item.assetId },
          { ...item.bucket, quantity: 1, componentParentAssetId: item.assetId },
        ];
        await validateDocumentConfiguration(tx, { type: 'REMISSION', items });
        await validateDocumentConfiguration(tx, {
          type: 'REMISSION',
          items: [
            ...items,
            {
              assetId: '6ae7ef66-8007-41b5-8046-b7da8567ca65',
              quantity: 1,
              componentParentAssetId: item.assetId,
            },
          ],
        });
        const node = randomUUID();
        await validateDocumentConfiguration(tx, {
          id: randomUUID(),
          docDate: new Date('2026-10-01T18:00:00Z'),
          type: 'REMISSION',
          items: [
            { ...items[0], compositionNodeId: node },
            {
              ...items[1],
              compositionNodeId: randomUUID(),
              parentCompositionNodeId: node,
            },
          ],
        });
        // Partial returns must not demand today's default bucket.
        await validateDocumentConfiguration(tx, {
          type: 'RETURN',
          items: [{ assetId: item.assetId }],
        });
      });
    }
    assert.equal(
      new Set(report.map((r) => r.bucket.assetId ?? r.bucket.accessoryId)).size,
      7,
    );
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          database: 'equipment_configuration_qa_20261001',
          newBuckets: report.filter((r) => r.created).length,
          sevenDistinctIdentities: true,
          missingBucketRejected: true,
          bucketAccepted: true,
          partialReturnNotBlocked: true,
          optionalImplementWithBucketAccepted: true,
          noAutomaticImplementSwap: true,
          report,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
