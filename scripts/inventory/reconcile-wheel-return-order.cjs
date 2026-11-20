// Narrow, audited repair of an ambiguous date-only legacy tie. Default is rollback.
// Run via Railway Postgres variables; credentials stay in process memory.
const { Client } = require('pg');
const { Prisma } = require('@prisma/client');
const { planBulkReturnAllocation } = require('../../apps/api/dist/src/documents/bulk-return-allocation');
const { assertBulkSourceTimeline } = require('../../apps/api/dist/src/inventory/bulk-source-timeline');
const apply = process.argv.includes('--apply');
const target = {
  sku: '020d7a02-edf9-404d-84cf-f0bb7f6eb893',
  owner: '8941f5b2-56eb-4ecf-899e-7386bac0b04d',
  site: 'bdbb5b44-30bb-47fe-bc72-70e605590c9a',
  draft: 'e7fa5935-cec5-48ec-992c-136083886b4d',
  delivery: '9017dcbb-aa29-434c-adc1-35dc1998ec34',
  returned: 'e87a6533-d3a6-4ea0-85b8-094828f61b31',
};
const db = new Client({ connectionString: process.env.DATABASE_PUBLIC_URL });
const check = (ok, message) => { if (!ok) throw new Error(message); };
const sources = (quantity, locationId = target.site) => [{
  skuId: target.sku, ownerWarehouseId: target.owner, quantity, locationId,
}];
async function history() {
  const { rows } = await db.query(`SELECT l.*, json_build_object('name', s.name) AS sku,
    CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id',d.id,'type',d.type,
      'status',d.status,'consecutive',d.consecutive,'docDate',d."docDate",
      'items',COALESCE((SELECT json_agg(json_build_object('id',i.id,'skuId',i."skuId",
        'assetId',i."assetId",'accessoryId',i."accessoryId",'quantity',i.quantity::text,
        'condition',i.condition,'sourceDocumentItemId',i."sourceDocumentItemId"))
        FROM "DocumentItem" i WHERE i."documentId"=d.id AND i."skuId"=l."skuId"),'[]')) END AS document
    FROM "StockLedger" l JOIN "Sku" s ON s.id=l."skuId"
    LEFT JOIN "Document" d ON d.id=l."refDocumentId"
    WHERE l."skuId"=$1 AND l."ownerWarehouseId"=$2 AND l."customerWorksiteId"=$3
      AND l."assetId" IS NULL AND l."movementType" IN ('OUT','ON_SITE','IN','TRANSIT')
      AND (l."refDocumentId" IS NULL OR l."refDocumentId"<>$4)
    ORDER BY l."effectiveAt",l."appendOrder" ASC NULLS FIRST,l."createdAt",l.id`,
  [target.sku,target.owner,target.site,target.draft]);
  return rows.map(row => ({ ...row, quantity: new Prisma.Decimal(row.quantity),
    document: row.document ? { ...row.document, docDate: new Date(row.document.docDate) } : null }));
}
(async () => {
  check(process.env.DATABASE_PUBLIC_URL, 'Missing selected database connection');
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='30s'");
  await db.query('SELECT id FROM "Sku" WHERE id=$1 FOR UPDATE',[target.sku]);
  const before = await history();
  const delivery = before.find(row => row.id === target.delivery);
  const returned = before.find(row => row.id === target.returned);
  check(before.length === 4 && delivery && returned, 'History changed: manual re-review required');
  check(delivery.movementType === 'OUT' && delivery.quantity.eq(-2)
    && returned.movementType === 'IN' && returned.quantity.eq(4), 'Unexpected quantities');
  check(delivery.effectiveAt.toISOString() === '2026-08-04T17:00:00.000Z'
    && returned.effectiveAt.getTime() === delivery.effectiveAt.getTime(), 'Unexpected effective dates');
  check(delivery.document.consecutive === 'RM019257' && returned.document.consecutive === 'DV019171'
    && [delivery,returned].every(row => row.document.status === 'CONFIRMED' && !row.reversedByDocumentId), 'Unexpected documents');
  const docs = await db.query('SELECT id,notes FROM "Document" WHERE id=ANY($1::text[])',[ [delivery.refDocumentId,returned.refDocumentId] ]);
  check(docs.rows.every(row => /(?:^|\|)\s*FECHA DOCUMENTO: 2026-08-04\s*(?:\||$)/i.test(row.notes)), 'Precise time present: do not infer chronology');
  const draft = (await db.query('SELECT * FROM "Document" WHERE id=$1 FOR UPDATE',[target.draft])).rows[0];
  check(draft?.status === 'DRAFT' && draft.customerWorksiteId === target.site, 'Draft changed');
  const items = (await db.query('SELECT * FROM "DocumentItem" WHERE "documentId"=$1',[target.draft])).rows;
  check(items.length === 1 && items[0].skuId === target.sku && items[0].condition === target.owner
    && new Prisma.Decimal(items[0].quantity).eq(1), 'Requested return changed');
  let previousError;
  try { planBulkReturnAllocation(before,items,draft.docDate); }
  catch(error) { previousError=error.message; }
  check(previousError, 'No longer blocked: repair unnecessary');
  const sameInstant = (await db.query(`SELECT id FROM "StockLedger" WHERE "skuId"=$1
    AND "ownerWarehouseId"=$2 AND "effectiveAt"=$3 AND ("customerWorksiteId"=$4
      OR "warehouseId"=ANY($5::text[]))`,
  [target.sku,target.owner,delivery.effectiveAt,target.site,[delivery.warehouseId,returned.warehouseId].filter(Boolean)])).rows;
  check(sameInstant.length === 2, 'Other same-instant movements: manual re-review required');
  check(delivery.appendOrder == null && returned.appendOrder == null, 'Order already changed');
  // Explicit administrative ordering within one date-only tie. No date, quantity,
  // documentary allocation, invoice or stock total is rewritten.
  for (const id of [target.delivery,target.returned]) {
    await db.query(`UPDATE "StockLedger" SET "appendOrder"=nextval(pg_get_serial_sequence('"StockLedger"','appendOrder')) WHERE id=$1`,[id]);
  }
  const tx = { $queryRaw: async query => (await db.query(query.text,query.values)).rows };
  const after = await history();
  const from = new Date(delivery.effectiveAt.getTime()-1);
  await assertBulkSourceTimeline(tx,'WORKSITE',sources(0),from);
  for (const warehouseId of new Set([delivery.warehouseId,returned.warehouseId].filter(Boolean))) {
    await assertBulkSourceTimeline(tx,'WAREHOUSE',sources(0,warehouseId),from);
  }
  await assertBulkSourceTimeline(tx,'WORKSITE',sources(1),draft.docDate);
  const plans = planBulkReturnAllocation(after,items,draft.docDate);
  check(plans.get(items[0].id)?.reduce((sum,p)=>sum.plus(p.quantity),new Prisma.Decimal(0)).eq(1),'Return allocation failed');
  check(before.every(old => {
    const current=after.find(row=>row.id===old.id);
    return current.quantity.eq(old.quantity) && current.effectiveAt.getTime()===old.effectiveAt.getTime();
  }), 'Quantity or date changed');
  const evidence = { apply, draft: draft.consecutive, material: after[0].sku.name,
    previousError, scope:target, administrativeOrder:['RM019257','DV019171'],
    newOrder:after.filter(row=>[target.delivery,target.returned].includes(row.id)).map(row=>({
      id:row.id,consecutive:row.document.consecutive,appendOrder:row.appendOrder})),
    checks:{worksiteChronology:true,warehouseChronology:true,returnOneUnit:true,quantitiesAndDatesPreserved:true},
    draftStatus:'DRAFT', note:'Historical date-only tie; ordering is administrative, not an assertion of physical arrival time.' };
  await db.query(apply?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify(evidence,null,2));
})().catch(async error=>{await db.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;})
  .finally(()=>db.end());
