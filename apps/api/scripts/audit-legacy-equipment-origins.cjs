// Read-only queue: this command deliberately has no apply/bulk-review option.
const { PrismaClient } = require('@prisma/client');
require('./commercial-qa-target.cjs');
const { resolveLatestSerializedMovements } = require('../dist/src/inventory/serialized-ledger-location');
const { inspectLegacyEquipmentOrigin } = require('../dist/src/documents/legacy-equipment-origin');
const db = new PrismaClient();
(async () => {
  const history = await db.stockLedger.findMany({ where: { assetId: { not: null }, reversedByDocumentId: null } });
  const current = [...resolveLatestSerializedMovements(history).values()].map(row => row.locationMovement)
    .filter(row => row?.customerWorksiteId && ['OUT', 'ON_SITE'].includes(row.movementType));
  const cases = [];
  for (const row of current) {
    try {
      const inspected = await inspectLegacyEquipmentOrigin(db, row.id, '2026-10-01');
      cases.push({ status: 'PENDING_INDIVIDUAL_REVIEW', fingerprint: inspected.fingerprint, ...inspected.evidence });
    } catch (error) {
      cases.push({ status: 'NEEDS_CLARIFICATION', sourceLedgerId: row.id, assetId: row.assetId, customerWorksiteId: row.customerWorksiteId, reason: error.message });
    }
  }
  console.log(JSON.stringify({ database: new URL(process.env.DATABASE_URL).pathname.slice(1), readOnly: true,
    cases: cases.sort((a, b) => String(a.consecutive ?? '').localeCompare(String(b.consecutive ?? '')) || a.sourceLedgerId.localeCompare(b.sourceLedgerId)) }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
