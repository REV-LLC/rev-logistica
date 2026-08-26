import assert from 'node:assert/strict';
import test from 'node:test';

import { mapDocumentToRequestForm } from './request-form-mapping.ts';

const normalizePhone = (value) => {
  const digits = value?.replace(/\D/g, '') ?? '';
  return /^\d{10}$/.test(digits) ? digits : null;
};

test('restaura campos, notas, teléfonos y firma', () => {
  const form = mapDocumentToRequestForm(
    {
      id: 'document-1',
      type: 'RETURN',
      consecutive: 'DV10',
      docDate: '2026-08-26T12:00:00.000Z',
      notes: 'Equipo mojado | Entrega: ON_SITE | Vehiculo: vehicle-1 | Conductor: driver-1 | Recibe: receiver-1',
      recipientPhones: ['300 123 4567', 'invalido'],
      warehouse: { id: 'warehouse-1' },
      customerWorksite: { id: 'worksite-1', customer: { id: 'customer-1' } },
      files: [{ fileType: 'SIGNATURE_RECEIVED', storageKey: 'signature-key' }],
      items: [],
    },
    { createSelectionId: () => 'unused', normalizePhone },
  );

  assert.equal(form.docType, 'RETURN');
  assert.equal(form.observations, 'Equipo mojado');
  assert.equal(form.driverId, 'receiver-1');
  assert.deepEqual(form.additionalRecipientPhones, ['3001234567']);
  assert.equal(form.receivedSignature, 'signature-key');
});

test('convierte ítems libres, masivos y serializados preservando daño y dueño', () => {
  let id = 0;
  const form = mapDocumentToRequestForm(
    {
      id: 'document-1',
      type: 'REMISSION',
      items: [
        { requestedTag: 'CUÑA', quantity: '2', condition: null },
        { skuId: 'sku-1', sku: { name: 'ANDAMIO' }, quantity: 3, condition: 'owner-1' },
        {
          assetId: 'asset-1',
          condition: 'owner-1',
          conditionNote: 'Golpe lateral',
          asset: { description: 'MEZCLADORA', serialOrEngine: 'SER-1', assignedToMixer: { id: 'mixer-1' } },
        },
      ],
    },
    { createSelectionId: () => `selection-${++id}`, normalizePhone },
  );

  assert.equal(form.selectedItems[0].type, 'free');
  assert.equal(form.selectedItems[0].ownerWarehouseId, null);
  assert.equal(form.selectedItems[1].bulkKey, 'sku-1::owner-1');
  assert.equal(form.selectedItems[2].type, 'serial');
  assert.equal(form.selectedItems[2].isDamaged, true);
  assert.equal(form.selectedItems[2].damageDescription, 'Golpe lateral');
  assert.equal(form.selectedItems[2].associatedMixerId, 'mixer-1');
});

test('tolera fechas inválidas sin tumbar la recuperación', () => {
  const form = mapDocumentToRequestForm(
    { id: 'document-1', type: 'REMISSION', docDate: 'fecha-invalida', items: [] },
    { createSelectionId: () => 'unused', normalizePhone },
  );
  assert.equal(form.docDate, '');
});
