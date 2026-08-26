import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAutosavePayload,
  buildDocumentPayload,
  buildDraftPersistencePayload,
  buildRequestNotes,
  withDocPrefix,
} from './request-payload.ts';

const source = {
  docType: 'REMISSION',
  consecutive: 'RM-123',
  warehouseId: 'warehouse-1',
  customerWorksiteId: 'worksite-1',
  observations: 'Entregar temprano',
  docDate: '2026-08-26',
  deliveryMode: 'ON_SITE',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
  dispatcherId: null,
  recipientPhones: ['3001234567'],
  receivedSignature: 'signature',
  items: [
    { skuId: 'sku-1', quantity: 2, ownerWarehouseId: undefined },
  ],
};

test('normaliza el prefijo según el tipo de documento', () => {
  assert.equal(withDocPrefix('DV-123', 'REMISSION'), 'RM123');
  assert.equal(withDocPrefix('RM 123', 'RETURN'), 'DV123');
});

test('construye las notas de una remisión en obra', () => {
  assert.equal(
    buildRequestNotes(source),
    'Entregar temprano | Fecha documento: 2026-08-26 | Entrega: ON_SITE | Vehiculo: vehicle-1 | Conductor: driver-1',
  );
});

test('el autoguardado conserva firma, destinatarios e ítems con dueño pendiente', () => {
  const payload = buildAutosavePayload(source);
  assert.equal(payload.number, 'RM123');
  assert.equal(payload.receivedSignature, 'signature');
  assert.deepEqual(payload.recipientPhones, ['3001234567']);
  assert.equal(payload.items[0].ownerWarehouseId, undefined);
});

test('la edición de Office no reemplaza la firma existente', () => {
  const payload = buildDocumentPayload(source, {
    shouldSendWhatsapp: true,
    editingRequestId: 'document-1',
    isAdminRole: false,
  });
  assert.equal(payload.receivedSignature, undefined);
  assert.equal('sendWhatsapp' in payload, false);
});

test('la creación incluye la decisión de WhatsApp', () => {
  const payload = buildDocumentPayload(source, {
    shouldSendWhatsapp: false,
    editingRequestId: null,
    isAdminRole: false,
  });
  assert.equal(payload.sendWhatsapp, false);
  assert.equal('recipientPhones' in payload, false);
});

test('online y offline persisten el mismo borrador final', () => {
  const autosavePayload = buildAutosavePayload(source);
  const documentPayload = buildDocumentPayload(source, {
    shouldSendWhatsapp: true,
    editingRequestId: null,
    isAdminRole: false,
  });
  const onlinePayload = buildDraftPersistencePayload(autosavePayload, documentPayload);
  const offlinePayload = buildDraftPersistencePayload(autosavePayload, documentPayload);
  assert.deepEqual(offlinePayload, onlinePayload);
  assert.equal(offlinePayload.sendWhatsapp, undefined);
});
