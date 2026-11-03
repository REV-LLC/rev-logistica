const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recoverable } = require('./recover-api-image.cjs');
const environment = { PRODUCTION_ENVIRONMENT_ID: 'production', IMAGE_REF: `ghcr.io/rev-llc/rev-logistica-api@sha256:${'a'.repeat(64)}` };
const failed = { schemaVersion: 1, action: 'production', success: false, phase: 'failed', failurePhase: 'deploying', environmentId: 'production', imageRef: environment.IMAGE_REF, deploymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previousDeploymentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', rollbackKind: 'registry-digest' };
test('only a matching failed deployment can request the separately guarded rollback', () => {
  assert.equal(recoverable(failed, environment), true);
  assert.equal(recoverable({ ...failed, rollbackKind: 'railway-native' }, environment), true);
});
for (const [name, patch] of [
  ['preflight failure', { failurePhase: 'preflight' }],
  ['configuration without deployment', { failurePhase: 'configured' }],
  ['unrelated environment', { environmentId: 'staging' }],
  ['unrelated digest', { imageRef: 'different' }],
  ['missing deployment ID', { deploymentId: null }],
  ['missing recovery ID', { previousDeploymentId: null }],
  ['unverified recovery', { rollbackKind: 'operator-required' }],
  ['success', { success: true }],
  ['staging delivery', { action: 'staging' }],
]) test(`never requests rollback for ${name}`, () => assert.equal(recoverable({ ...failed, ...patch }, environment), false));
