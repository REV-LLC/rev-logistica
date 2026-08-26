import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyApprovalRecovery } from './approval-errors.ts';

test('clasifica remisiones físicas requeridas aunque el backend las anide en message', () => {
  const providers = [{ providerWarehouseId: 'provider-1', providerName: 'Aliado', itemCount: 1, quantity: 2, documentUploaded: false }];
  assert.deepEqual(
    classifyApprovalRecovery({ message: { code: 'PROVIDER_REMISSION_REQUIRED', providers } }),
    { type: 'provider-remission-required', providers },
  );
});

test('clasifica la recuperación de motor de mezcladora', () => {
  assert.deepEqual(
    classifyApprovalRecovery({
      code: 'MISSING_MIXER_MOTOR',
      recovery: {
        type: 'SELECT_MIXER_MOTOR',
        mixerAssetId: 'mixer-1',
        ownerWarehouseId: 'warehouse-1',
      },
    }),
    {
      type: 'mixer-motor-required',
      mixerAssetId: 'mixer-1',
      ownerWarehouseId: 'warehouse-1',
    },
  );
});

test('ignora errores que no requieren un flujo de recuperación', () => {
  assert.equal(classifyApprovalRecovery({ code: 'UNRELATED_ERROR' }), null);
  assert.equal(classifyApprovalRecovery(null), null);
});
