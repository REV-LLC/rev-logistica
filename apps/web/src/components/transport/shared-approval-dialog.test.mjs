import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const detail = readFileSync(new URL('../../app/inventory/ledger/document/[documentId]/page.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./TransportRequestsWorkspace.tsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('./ApprovalResolutionDialog.tsx', import.meta.url), 'utf8');

test('request list and document detail render the same approval dialog without an inline copy', () => {
  for (const source of [detail, workspace]) assert.match(source, /<ApprovalResolutionDialog\s/);
  assert.ok(!detail.includes('title="Resolver tags antes de aprobar"'));
  assert.match(dialog, /\.filter\(\(serial\) => serial.skuId === selectedSku.id\)/);
  assert.ok(!dialog.includes('expectedInternal == null || serial.internalNumber === expectedInternal'));
});

test('detail resolves and refreshes per-item physical origin and preserves composition on every payload branch', () => {
  assert.match(detail, /inventoriesByOwner\[getRequestItemInventoryKey\(doc, item\)\]/);
  assert.match(detail, /\[getRequestItemInventoryKey\(resolveDocument, row\)\]/);
  assert.match(detail, /getRequestSourceWarehouseId\(resolveDocument, ownerWarehouseId, row.sourceWarehouseId\)/);
  const payload = detail.slice(detail.indexOf('const itemsPayload = resolveDocument.items.map'), detail.indexOf('await api(`/documents/${resolveDocument.id}/request`'));
  assert.match(payload, /documentCompositionPayload\(item\)/);
  assert.match(payload, /sourceWarehouseId: item.sourceWarehouseId/);
  assert.equal((payload.match(/\.\.\.composition,/g) ?? []).length, 6);
});
