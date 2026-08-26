import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  validateImageFile,
  validateOfflineFileDrafts,
} from './file-drafts.ts';

const labels = {
  invalidType: 'tipo inválido',
  tooLarge: 'archivo grande',
};

test('acepta imágenes admitidas dentro del límite', () => {
  const error = validateImageFile(
    { name: 'foto.jpg', type: 'image/jpeg', size: 1024, lastModified: 1 },
    labels,
  );
  assert.equal(error, null);
});

test('rechaza formatos y tamaños no permitidos', () => {
  assert.equal(
    validateImageFile(
      { name: 'archivo.pdf', type: 'application/pdf', size: 1024, lastModified: 1 },
      labels,
    ),
    'tipo inválido',
  );
  assert.equal(
    validateImageFile(
      {
        name: 'foto.png',
        type: 'image/png',
        size: MAX_IMAGE_FILE_SIZE_BYTES + 1,
        lastModified: 1,
      },
      labels,
    ),
    'archivo grande',
  );
});

test('solo bloquea el envío offline cuando existen archivos pendientes', () => {
  assert.equal(
    validateOfflineFileDrafts({ evidencePhotoCount: 0, providerRemissionCount: 0 }),
    null,
  );
  assert.match(
    validateOfflineFileDrafts({ evidencePhotoCount: 1, providerRemissionCount: 0 }) ?? '',
    /requieren conexión/,
  );
  assert.match(
    validateOfflineFileDrafts({ evidencePhotoCount: 0, providerRemissionCount: 1 }) ?? '',
    /requieren conexión/,
  );
});
