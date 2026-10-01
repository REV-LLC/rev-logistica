// Real HTTP guards, DTOs and persistence. Writes ONLY named local QA fixtures.
// Keep fixtures for UI inspection; this is deliberately not a production seed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('./commercial-qa-target.cjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = 'http://127.0.0.1:3059';
const tokens = {};
const runId = randomUUID().slice(0, 8);
const manifest = { runId, database: new URL(process.env.DATABASE_URL).pathname, cases: [] };
async function api(role, method, path, body, status, key) {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json',
      ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}),
      ...(key ? { 'idempotency-key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
  return result;
}
function pass(name) { manifest.cases.push(name); console.log('PASS', name); }
const note = (day) => `QA HTTP ${runId} | Fecha documento: 2026-10-${day}T12:00:00.000Z | Entrega: WAREHOUSE`;
async function draft(role, items, day, type = 'REMISSION') {
  const signature = await require('sharp')({ create: { width: 160, height: 40, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const payload = { type, warehouseId: manifest.warehouseId, inventorySourceMode: 'WAREHOUSE',
    customerWorksiteId: manifest.customerWorksiteId, notes: note(day) + (type === 'RETURN' ? ` | Recibe: ${manifest.receiverId}` : ''),
    recipientPhones: ['3000000000'],
    receivedSignature: `data:image/png;base64,${signature.toString('base64')}`, items };
  const key = randomUUID();
  const saved = await api(role, 'POST', '/documents/requests/autosave', payload, 201, key);
  const replay = await api(role, 'POST', '/documents/requests/autosave', payload, 201, key);
  assert.equal(saved.id, replay.id);
  manifest.documents ??= []; manifest.documents.push(saved.id);
  const updated = await api(role, 'PATCH', `/documents/${saved.id}/request/autosave`, payload, 200, randomUUID());
  assert.equal(updated.id, saved.id);
  const persisted = await db.document.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true } });
  assert.equal(persisted.docDate.toISOString(), `2026-10-${day}T12:00:00.000Z`);
  assert.equal(persisted.items.length, items.length);
  assert.deepEqual(new Set(persisted.items.map(i => i.compositionNodeId)), new Set(items.map(i => i.compositionNodeId)));
  return saved.id;
}
async function submitApprove(id) {
  await api('DRIVER', 'POST', `/documents/${id}/request/submit`, { sendWhatsapp: false }, 403);
  const key = randomUUID();
  await api('DRIVER', 'POST', `/documents/${id}/request/submit`, { sendWhatsapp: true }, 201, key);
  await api('DRIVER', 'POST', `/documents/${id}/request/submit`, { sendWhatsapp: true }, 201, key);
  await api('DRIVER', 'POST', `/documents/${id}/decision`, { action: 'APPROVE' }, 403);
  await api('OFFICE', 'POST', `/documents/${id}/decision`, { action: 'APPROVE' }, 201);
}
(async () => {
  try {
    for (const role of ['OFFICE', 'ADMIN', 'DRIVER']) {
      const login = await api(role, 'POST', '/auth/login', {
        email: `qa-config-${role.toLowerCase()}@example.invalid`, password: 'Only-local-QA-20260923!',
      }, 201);
      tokens[role] = login.access_token ?? login.accessToken;
      assert(tokens[role], 'JWT not returned');
    }
    pass('Real Office/Admin/Driver authentication; no auth bypass');
    const warehouse = await db.warehouse.findFirstOrThrow({ where: { type: 'OWN', active: true }, orderBy: { createdAt: 'asc' } });
    manifest.warehouseId = warehouse.id;
    const receiver = await db.employee.findFirstOrThrow({ select: { id: true, name: true, lastName: true }, orderBy: { id: 'asc' } });
    manifest.receiverId = receiver.id;
    const customer = await db.customer.create({ data: { name: `QA HTTP CONJUNTOS ${runId}`, phone: '3000000000', email: 'qa@example.invalid' } });
    const worksite = await db.worksite.create({ data: { name: `QA OBRA CONJUNTOS ${runId}` } });
    const site = await db.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
    manifest.customerId = customer.id; manifest.customerName = customer.name; manifest.customerWorksiteId = site.id;
    const payload = { family: { code: `QAHTTP${runId}`, name: `QA HTTP GENERICO ${runId}` },
      sku: { name: `QA HTTP MAQUINA ${runId}`, price: 100, replacementValue: 5000, chargeType: 'DAY' },
      asset: { brand: 'QA', model: runId }, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id,
      configuration: { version: 0, entries: [{ id: randomUUID(), role: 'ACCESSORY', quantity: 1,
        defaultIncluded: true, required: false,
        newPart: { name: `QA HTTP CABEZAL ${runId}`, kind: 'INDIVIDUAL', initialQuantity: 1, exclusive: false, compatibility: 'PARENT' } }] } };
    await api('DRIVER', 'POST', '/inventory/serialized-assets', payload, 403);
    const created = await api('OFFICE', 'POST', '/inventory/serialized-assets', payload, 201);
    manifest.assetId = created.asset.id;
    const config = await api('DRIVER', 'GET', `/equipment-configurations/assets/${manifest.assetId}`, undefined, 200);
    const childId = config.entries[0].accessoryId; manifest.accessoryId = childId;
    await api('DRIVER', 'PUT', `/equipment-configurations/assets/${manifest.assetId}`, { version: config.version, entries: [] }, 403);
    const nested = await api('OFFICE', 'PUT', `/equipment-configurations/accessories/${childId}`, {
      version: 0, entries: [{ id: randomUUID(), role: 'ACCESSORY', quantity: 4, maximumQuantity: 4, defaultIncluded: true, required: false,
        newPart: { name: `QA HTTP PIEZAS ${runId}`, kind: 'RETURNABLE', initialQuantity: 4, exclusive: false, compatibility: 'PARENT' } }],
    }, 200);
    const piecesId = nested.entries[0].accessoryId; manifest.piecesId = piecesId;
    pass('HTTP creation: generic asset → identified accessory → four returnable pieces; Driver read-only');
    const group = randomUUID();
    const withMode = randomUUID(), withoutMode = randomUUID();
    const profile = { scopeType: 'ASSET', scopeId: manifest.assetId, expectedVersion: 0, effectiveFrom: '2026-10-01',
      groups: [{ id: group, name: 'Implementos QA', selectors: [{ kind: 'ACCESSORY', id: childId }] }],
      modes: [
        { id: withoutMode, name: 'Sin implemento', unit: 'DAY', minimum: { value: '0', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount: '100' }, conditions: [{ groupId: group, presence: 'ABSENT' }], parts: [] },
        { id: withMode, name: 'Con implemento', unit: 'METER', minimum: { value: '0', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount: '200' }, conditions: [{ groupId: group, presence: 'PRESENT', minimumQuantity: 1 }], parts: [{ groupId: group, treatment: 'INCLUDED' }] },
      ] };
    await api('OFFICE', 'PUT', '/commercial-profiles', profile, 200);
    const subGroup = randomUUID();
    await api('OFFICE', 'PUT', '/commercial-profiles', { scopeType: 'ACCESSORY', scopeId: childId, expectedVersion: 0, effectiveFrom: '2026-10-01',
      groups: [{ id: subGroup, name: 'Piezas QA', selectors: [{ kind: 'ACCESSORY', id: piecesId }] }],
      modes: [{ id: randomUUID(), name: 'Incluido', unit: 'DAY', minimum: { value: '0', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount: '0' }, conditions: [], parts: [{ groupId: subGroup, treatment: 'INCLUDED' }] }],
    }, 200);
    const node = randomUUID(), childNode = randomUUID(), piecesNode = randomUUID();
    const balance = id => db.accessoryBalance.findFirstOrThrow({ where: { accessoryId: id, warehouseId: warehouse.id, quantity: { gt: 0 } } });
    const childBalance = await balance(childId), piecesBalance = await balance(piecesId);
    const root = { assetId: manifest.assetId, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id, compositionNodeId: node };
    const id = await draft('DRIVER', [root], '01');
    const reopened = await api('DRIVER', 'GET', `/documents/${id}`, undefined, 200);
    assert.equal(reopened.id, id);
    await submitApprove(id);
    pass('Driver autosave, stable IDs, idempotent retry, reload, submit; Office approval');
    const confirmed = await db.document.findUniqueOrThrow({ where: { id }, include: { items: true, ledger: true } });
    assert.equal(confirmed.status, 'CONFIRMED'); assert.equal(confirmed.ledger.length, 1);
    const rootItem = confirmed.items[0]; assert.equal(rootItem.commercialSnapshot.basePrice, '100');
    const lateId = await draft('DRIVER', [
      { accessoryId: childId, accessorySourceBalanceId: childBalance.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id,
        quantity: 1, compositionNodeId: childNode, parentSourceDocumentItemId: rootItem.id, componentParentAssetId: manifest.assetId },
      { accessoryId: piecesId, accessorySourceBalanceId: piecesBalance.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id,
        quantity: 4, compositionNodeId: piecesNode, parentCompositionNodeId: childNode, componentParentAssetId: manifest.assetId },
    ], '02');
    await submitApprove(lateId);
    const later = await db.document.findUniqueOrThrow({ where: { id: lateId }, include: { items: true } });
    const piecesItem = later.items.find(i => i.accessoryId === piecesId);
    assert.equal(piecesItem.parentCompositionNodeId, childNode);
    assert.equal(later.items.find(i => i.accessoryId === childId).parentSourceDocumentItemId, rootItem.id);
    pass('Later delivery keeps immediate parent and original equipment delivery');
    const shared = await api('OFFICE', 'GET', `/public/documents/${later.shareToken}`, undefined, 200);
    assert.equal(shared.items.length, 2);
    assert.equal(shared.items.find(i => i.accessoryId === piecesId).accessoryName, `QA HTTP PIEZAS ${runId}`.toUpperCase());
    assert(shared.items.find(i => i.accessoryId === childId).accessoryCode);
    assert.equal(shared.items.find(i => i.accessoryId === piecesId).accessoryCode, null);
    const pdf = await fetch(`${base}/public/documents/${later.shareToken}/pdf`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdfBuffer.subarray(0, 5).toString(), '%PDF-');
    manifest.pdfPath = `/private/tmp/qa-commercial-http-${runId}.pdf`;
    fs.writeFileSync(manifest.pdfPath, pdfBuffer);
    pass('Public document includes frozen accessory names/codes without requestedTag; real PDF generated');
    const beforeReplay = await db.accessoryMovement.count({ where: { documentId: lateId } });
    await api('ADMIN', 'POST', `/documents/${lateId}/decision`, { action: 'APPROVE' }, 201);
    assert.equal(await db.accessoryMovement.count({ where: { documentId: lateId } }), beforeReplay);
    pass('Repeat approval cannot duplicate physical accessory movements');
    const sitePieces = await db.accessoryBalance.findFirstOrThrow({ where: { accessoryId: piecesId, customerWorksiteId: site.id, quantity: { gt: 0 } } });
    const returned = await draft('DRIVER', [{ accessoryId: piecesId, accessorySourceBalanceId: sitePieces.id, ownerWarehouseId: warehouse.id,
      quantity: 2, compositionNodeId: randomUUID(), sourceDocumentItemId: piecesItem.id, componentParentAssetId: manifest.assetId }], '03', 'RETURN');
    await submitApprove(returned);
    const returnDocument = await db.document.findUniqueOrThrow({ where: { id: returned } });
    const sharedReturn = await api('OFFICE', 'GET', `/public/documents/${returnDocument.shareToken}`, undefined, 200);
    assert.equal(sharedReturn.responsibles.receivedBy, `${receiver.name} ${receiver.lastName}`.trim());
    assert.equal((await db.accessoryBalance.findUniqueOrThrow({ where: { id: sitePieces.id } })).quantity, 2);
    pass('Partial return 4→2 keeps documentary origin and physical balance');
    await api('OFFICE', 'POST', '/documents/direct', { type: 'RETURN', warehouseId: warehouse.id,
      customerWorksiteId: site.id, notes: note('04'), items: [{ accessoryId: piecesId,
        accessorySourceBalanceId: sitePieces.id, ownerWarehouseId: warehouse.id, quantity: 3,
        compositionNodeId: randomUUID(), sourceDocumentItemId: piecesItem.id, componentParentAssetId: manifest.assetId }] }, 400);
    assert.equal((await db.accessoryBalance.findUniqueOrThrow({ where: { id: sitePieces.id } })).quantity, 2);
    pass('Excess return rejected atomically; remaining balance unchanged');
    await api('OFFICE', 'PUT', '/commercial-profiles', { ...profile, expectedVersion: 1, modes: profile.modes.map(m => ({ ...m, pricing: { source: 'FIXED', amount: '9999' } })) }, 200);
    assert.equal((await db.documentItem.findUniqueOrThrow({ where: { id: rootItem.id } })).commercialSnapshot.basePrice, '100');
    const prepared = await api('OFFICE', 'GET', `/annexes/prepare?customerWorksiteId=${site.id}&from=2026-10-01&to=2026-10-05&through=2026-10-05`, undefined, 200);
    const rootRentals = prepared.input.rentals.filter(r => r.assetId === manifest.assetId);
    assert.equal(rootRentals.length, 2);
    assert.deepEqual(rootRentals.map(r => r.commercial.mode.unit), ['DAY', 'METER']);
    assert.deepEqual(rootRentals.map(r => r.pricing.basePrice), ['100', '200']);
    assert.equal(rootRentals[0].commercialInterval.to, '2026-10-01');
    assert.equal(rootRentals[1].commercialInterval.from, '2026-10-02');
    rootRentals[1].metering.reports = [{ date: '2026-10-02', meters: '10', source: { reference: `QA-${runId}-10METERS`, origin: 'PHYSICAL' } }];
    const preview = await api('OFFICE', 'POST', '/annexes/preview', prepared.input, 201);
    assert.equal(preview.totals.rentalNet, '2100.00');
    assert(preview.lines.some(line => line.net === '0.00'), 'Explicit zero accessories must stay visible');
    const savedAnnex = await api('OFFICE', 'POST', '/annexes/drafts', { customerWorksiteId: site.id,
      expectedRevision: 0, reason: 'QA HTTP immutable commercial round-trip', input: prepared.input }, 201);
    manifest.annexId = savedAnnex.id;
    const loadedAnnex = await api('OFFICE', 'GET', `/annexes/drafts/${savedAnnex.id}`, undefined, 200);
    assert.equal(loadedAnnex.revisions[0].result.totals.rentalNet, '2100.00');
    await api('OFFICE', 'POST', '/annexes/drafts', { customerWorksiteId: site.id,
      expectedRevision: 0, reason: 'QA stale retry must not overwrite', input: prepared.input }, 409);
    fs.writeFileSync(`/private/tmp/qa-commercial-http-${runId}-annex.json`, JSON.stringify(prepared, null, 2));
    pass('HTTP annex: DAY→METER, 100 + 10×200 = 2100; visible zero lines; save/reload and 409 stale revision; immutable tariff');
    manifest.result = 'PASS';
  } finally {
    fs.writeFileSync(`/private/tmp/qa-commercial-http-${runId}.json`, JSON.stringify(manifest, null, 2));
    console.log('QA manifest:', `/private/tmp/qa-commercial-http-${runId}.json`);
    await db.$disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
