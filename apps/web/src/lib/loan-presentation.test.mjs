import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loanMovementPresentation } from './loan-presentation.ts';

for (const paymentsPositive of [false, true]) {
  test(`loan signs and colors invert together, paymentsPositive=${paymentsPositive}`, () => {
    const payment = loanMovementPresentation('PAYMENT', paymentsPositive);
    const charge = loanMovementPresentation('CHARGE', paymentsPositive);
    const opening = loanMovementPresentation('OPENING', paymentsPositive);
    assert.deepEqual(payment, paymentsPositive ? { sign: '+', color: 'green.8' } : { sign: '−', color: 'red.8' });
    assert.deepEqual(charge, paymentsPositive ? { sign: '−', color: 'red.8' } : { sign: '+', color: 'green.8' });
    assert.deepEqual(opening, charge);
  });
}
