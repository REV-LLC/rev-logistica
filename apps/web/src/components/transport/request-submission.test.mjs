import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeLocalWhatsappPhone,
  validateRequestSubmission,
} from './request-submission.ts';

const validSubmission = {
  docType: 'REMISSION',
  deliveryMode: 'ON_SITE',
  docDate: '2026-08-26',
  customerId: 'customer-1',
  customerWorksiteId: 'worksite-1',
  selectedItems: [{ type: 'bulk', name: 'CUÑA', ownerWarehouseId: null }],
  shouldSendWhatsapp: false,
  recipientPhoneDraft: '',
  recipientPhones: [],
  editingRequestId: null,
  receivedSignature: 'data:image/png;base64,signature',
  effectiveWarehouseId: 'warehouse-1',
  isDriverRole: false,
  driverId: null,
};

test('permite a Office enviar una remisión con dueño del ítem pendiente', () => {
  assert.equal(validateRequestSubmission(validSubmission), null);
});

test('exige conductor a Driver para una remisión en obra', () => {
  assert.equal(
    validateRequestSubmission({ ...validSubmission, isDriverRole: true }),
    'Tu usuario no esta vinculado a un empleado conductor.',
  );
});

test('permite a Driver enviar la remisión en obra cuando tiene conductor', () => {
  assert.equal(
    validateRequestSubmission({ ...validSubmission, isDriverRole: true, driverId: 'driver-1' }),
    null,
  );
});

test('una devolución exige bodega y conductor', () => {
  const returnSubmission = { ...validSubmission, docType: 'RETURN' };
  assert.equal(
    validateRequestSubmission({ ...returnSubmission, effectiveWarehouseId: null }),
    'Selecciona la bodega para la devolucion.',
  );
  assert.equal(
    validateRequestSubmission(returnSubmission),
    'Selecciona el conductor responsable de recoger la devolución.',
  );
});

test('una devolución exige descripción para un ítem dañado', () => {
  assert.equal(
    validateRequestSubmission({
      ...validSubmission,
      docType: 'RETURN',
      driverId: 'driver-1',
      selectedItems: [{ type: 'serial', name: 'MEZCLADORA', isDamaged: true }],
    }),
    'Describe el daño de MEZCLADORA.',
  );
});

test('normaliza teléfonos colombianos locales e internacionales', () => {
  assert.equal(normalizeLocalWhatsappPhone('300 123 4567'), '3001234567');
  assert.equal(normalizeLocalWhatsappPhone('+57 300 123 4567'), '3001234567');
  assert.equal(normalizeLocalWhatsappPhone('123'), null);
});
