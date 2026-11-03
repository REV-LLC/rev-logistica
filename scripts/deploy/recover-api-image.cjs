const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function recoverable(evidence, environment) {
  return evidence?.schemaVersion === 1 && evidence.action === 'production' &&
    evidence.success === false && evidence.phase === 'failed' && evidence.failurePhase === 'deploying' &&
    evidence.environmentId === environment.PRODUCTION_ENVIRONMENT_ID &&
    evidence.imageRef === environment.IMAGE_REF &&
    UUID.test(evidence.deploymentId || '') && UUID.test(evidence.previousDeploymentId || '') &&
    ['registry-digest', 'railway-native'].includes(evidence.rollbackKind);
}

function main(environment = process.env) {
  const file = environment.ROLLBACK_EVIDENCE_PATH;
  if (!file || !fs.existsSync(file) || !recoverable(JSON.parse(fs.readFileSync(file, 'utf8')), environment)) {
    console.log('Automatic rollback was not attempted: no matching failed deployment with verified recovery evidence.');
    return;
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, 'promote-api-image.cjs'), 'rollback'], { env: environment, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Automatic rollback was not verified; inspect sanitized deployment evidence.');
}

module.exports = { recoverable };
if (require.main === module) {
  try { main(); } catch { console.error('Production recovery did not complete; inspect sanitized deployment evidence.'); process.exitCode = 1; }
}
