import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTransportModule } from './test-support.cjs';
class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}
const { formatTransportError } = loadTransportModule('request-errors.ts', { '@/lib/api': { ApiError } });
test('muestra instrucciones en español sin el prefijo HTTP', () => {
  const message = 'No se pudo registrar la devolución. Revisa el documento RM001.';
  assert.equal(formatTransportError(new ApiError(400, message), 'Error'), message);
});
test('sustituye mensajes técnicos por instrucciones comprensibles', () => {
  assert.equal(formatTransportError(new ApiError(500, 'Internal request failed'), 'Intenta de nuevo.'), 'Intenta de nuevo.');
  assert.equal(formatTransportError(null, 'Intenta de nuevo.'), 'Intenta de nuevo.');
});
