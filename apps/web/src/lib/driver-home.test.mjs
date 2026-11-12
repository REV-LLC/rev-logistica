import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../components/transport/TransportRequestsWorkspace.tsx', import.meta.url), 'utf8');

test('driver home offers both explicit document actions before loading operational data', () => {
  assert.match(home, /isDriver \? <nav[^>]*aria-label="Documentos de transporte"/);
  assert.match(home, /href="\/transport\/generate\?type=REMISSION"/);
  assert.match(home, /href="\/transport\/generate\?type=RETURN"/);
  assert.ok(home.indexOf('aria-label="Documentos de transporte"') < home.indexOf('{loading ?'));
});

test('explicit document shortcuts select the type and preserve draft/edit precedence', () => {
  assert.match(workspace, /requestedType === 'REMISSION' \|\| requestedType === 'RETURN'/);
  assert.match(workspace, /hasRequestedType && !editId && !explicitDraftId && !autosaveDraftId && !editingRequestId/);
  assert.match(workspace, /setDocType\(requestedType\)/);
  assert.match(workspace, /currentUserId && !isTabletRole && !hasRequestedType/);
});
