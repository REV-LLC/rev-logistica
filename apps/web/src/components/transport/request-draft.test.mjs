import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRequestDraftStorageKey,
  resolveRequestDraftTarget,
} from './request-draft.ts';

test('genera una clave de borrador aislada por usuario', () => {
  assert.equal(getRequestDraftStorageKey('driver-1'), 'rev:transport-draft:driver-1');
});

test('la edición explícita tiene prioridad sobre el borrador guardado', () => {
  assert.deepEqual(resolveRequestDraftTarget('?edit=document-1', 'draft-1'), {
    documentId: 'document-1',
    autosaved: false,
    target: 'edit:document-1',
  });
});

test('un borrador explícito tiene prioridad sobre localStorage', () => {
  assert.deepEqual(resolveRequestDraftTarget('?draft=draft-url', 'draft-local'), {
    documentId: 'draft-url',
    autosaved: true,
    target: 'draft:draft-url',
  });
});

test('recupera el borrador local cuando la URL no define documento', () => {
  assert.deepEqual(resolveRequestDraftTarget('', 'draft-local'), {
    documentId: 'draft-local',
    autosaved: true,
    target: 'draft:draft-local',
  });
});
