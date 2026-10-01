import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from './test-support.cjs';
const { parseNotes } = loadTransportModule('request-formatting.ts');
test('reabrir notas normalizadas conserva selección de receptor, conductor, vehículo y despachador', () => {
  const id = 'e666c971-6b4e-4eb6-a1fe-2769dd8468ae';
  const saved = parseNotes(`ENTREGA: WAREHOUSE | RECIBE: ${id.toUpperCase()} | CONDUCTOR: ${id.toUpperCase()} | VEHÍCULO: ${id.toUpperCase()} | DESPACHADOR: ${id.toUpperCase()}`);
  assert.deepEqual(saved, { deliveryMode: 'WAREHOUSE', receiverId: id, driverId: id, vehicleId: id, dispatcherId: id });
  assert.equal(parseNotes('Recibe: Legacy-ID').receiverId, 'Legacy-ID');
});
