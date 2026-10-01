// Business-confirmed catalogue corrections, ONLY on the Oct 1 isolated copy.
// IDs below are review inputs for this one-time preparation, never runtime family-name rules.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('./commercial-qa-target.cjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
assert.equal(
  new URL(process.env.DATABASE_URL).pathname,
  '/equipment_configuration_qa_20261001',
);
const approved = {
  aptFamily: 'cb4766be-125e-476d-a2e3-bbd9f4302911',
  demolisherFamily: '2f876312-9310-45d6-88c3-b0af1bafea8d',
  aptTipsFamily: '4ee34422-c609-4ead-a77a-40ccebc34909',
  aptTipsSku: '329d20ea-f69d-4c40-8e94-2512c9830d3e',
  cutterFamily: 'c35f335f-ef6c-43ba-af2d-2282e23480a1',
  diskFamily: 'a325290d-b8a5-40ea-9fb6-49410cc3c149',
  diskSku: '47706724-8d2d-4f4a-97b6-72d04cea56e7',
  newHolland: '578d3f90-06f8-46b4-adb1-6d9a9ed56b76',
  bucket: 'cc96d5fb-0abe-4773-8d0a-1fbd4dd59422',
  confirmedDelivery: 'RM019330',
};
const entry = (target, extras = {}) => ({
  id: randomUUID(),
  role: 'ACCESSORY',
  quantity: 1,
  required: false,
  defaultIncluded: false,
  ...target,
  ...extras,
});
function payload(config) {
  return {
    version: config.version,
    notes: config.notes,
    entries: config.entries.map(
      ({
        id,
        role,
        quantity,
        required,
        defaultIncluded,
        assetId,
        accessoryId,
        familyId,
        maximumQuantity,
      }) => ({
        id,
        role,
        quantity,
        required,
        defaultIncluded,
        ...(assetId ? { assetId } : {}),
        ...(accessoryId ? { accessoryId } : {}),
        ...(familyId ? { familyId } : {}),
        maximumQuantity,
      }),
    ),
  };
}
async function historicalHash() {
  const result = {};
  for (const name of [
    'StockLedger',
    'Document',
    'DocumentItem',
    'Accessory',
    'AccessoryBalance',
    'AccessoryMovement',
    'Asset',
    'Sku',
  ])
    result[name] = await db.$queryRawUnsafe(
      `SELECT count(*)::text AS count, md5(string_agg(to_jsonb(t)::text, '' ORDER BY id)) AS hash FROM "${name}" t`,
    );
  return result;
}
(async () => {
  try {
    const before = await historicalHash();
    const login = await fetch('http://127.0.0.1:3059/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'qa-config-office@example.invalid',
        password: 'Only-local-QA-20260923!',
      }),
    });
    assert.equal(login.status, 201);
    const session = await login.json();
    const token = session.access_token ?? session.accessToken;
    const request = async (id, data) => {
      const response = await fetch(
        `http://127.0.0.1:3059/equipment-configurations/assets/${id}`,
        {
          method: data ? 'PUT' : 'GET',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          ...(data ? { body: JSON.stringify(data) } : {}),
        },
      );
      const value = await response.json();
      assert.equal(response.status, 200, JSON.stringify(value));
      return value;
    };
    // Check the legacy quantity catalogue is exactly the approved reference. Do not duplicate its stock.
    for (const [familyId, skuId] of [
      [approved.aptTipsFamily, approved.aptTipsSku],
      [approved.diskFamily, approved.diskSku],
    ]) {
      const skus = await db.sku.findMany({
        where: { assetFamilyId: familyId, active: true },
        select: { id: true },
      });
      assert.deepEqual(
        skus.map((x) => x.id),
        [skuId],
        'Re-audit required: approved family catalogue changed',
      );
    }
    const report = {
      database: 'equipment_configuration_qa_20261001',
      removedWrongTips: [],
      apt: [],
      cutters: [],
      defaultBuckets: [],
    };
    const units = (family) =>
      db.asset.findMany({
        where: {
          active: true,
          deletedAt: null,
          sku: { assetFamilyId: family },
        },
        select: {
          id: true,
          internalNumber: true,
          sku: { select: { name: true } },
        },
      });
    for (const asset of await units(approved.demolisherFamily)) {
      const current = await request(asset.id),
        next = payload(current);
      next.entries = next.entries.filter(
        (row) => row.familyId !== approved.aptTipsFamily,
      );
      if (next.entries.length !== current.entries.length) {
        await request(asset.id, next);
        report.removedWrongTips.push(asset);
      }
    }
    for (const [familyId, childFamily, kind] of [
      [approved.aptFamily, approved.aptTipsFamily, 'apt'],
      [approved.cutterFamily, approved.diskFamily, 'cutters'],
    ]) {
      for (const asset of await units(familyId)) {
        const current = await request(asset.id),
          next = payload(current);
        if (!next.entries.some((row) => row.familyId === childFamily)) {
          next.entries.push(entry({ familyId: childFamily }));
          await request(asset.id, next);
        }
        report[kind].push(asset);
      }
    }
    const delivery = await db.document.findUniqueOrThrow({
      where: { consecutive: approved.confirmedDelivery },
      include: { items: true },
    });
    assert.equal(delivery.status, 'CONFIRMED');
    assert(delivery.items.some((row) => row.assetId === approved.newHolland));
    assert(delivery.items.some((row) => row.assetId === approved.bucket));
    const current = await request(approved.newHolland),
      next = payload(current);
    const bucket = next.entries.find((row) => row.assetId === approved.bucket);
    if (bucket) {
      bucket.defaultIncluded = true;
      bucket.quantity = 1;
      bucket.maximumQuantity = 1;
    } else
      next.entries.push(
        entry(
          { assetId: approved.bucket },
          { defaultIncluded: true, maximumQuantity: 1 },
        ),
      );
    if (
      !bucket?.defaultIncluded ||
      JSON.stringify(next.entries) !== JSON.stringify(payload(current).entries)
    )
      await request(approved.newHolland, next);
    report.defaultBuckets.push({
      assetId: approved.newHolland,
      bucketAssetId: approved.bucket,
      confirmedBy: approved.confirmedDelivery,
    });
    assert.deepEqual(
      await historicalHash(),
      before,
      'Historical documents, balances, inventory or movements were altered',
    );
    report.originalHistoryAndStockUnchanged = true;
    report.pending =
      'Default buckets are prepared separately by prepare-default-buckets-qa.cjs after physical confirmation. Legacy bulk references remain bulk until separately reconciled.';
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
