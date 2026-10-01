// Explicit local targets shared by the two collaborating QA checkouts.
const url = new URL(process.env.DATABASE_URL || '');
const targets = {
  '55439/rev_annex_qa': 'annex-qa@local.invalid',
  '54414/equipment_commercial_qa_20260930': 'qa-config-office@example.invalid',
  '54414/equipment_commercial_live_20260930': 'qa-config-office@example.invalid',
  '54414/equipment_commercial_no_payroll_20261001': 'qa-config-office@example.invalid',
};
const actorEmail = targets[`${url.port}${url.pathname}`];
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !actorEmail)
  throw new Error(
    'Only the explicitly isolated local commercial QA databases are allowed',
  );
module.exports = { actorEmail };
