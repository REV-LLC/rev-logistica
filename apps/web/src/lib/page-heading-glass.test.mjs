import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('page heading glass is opt-in, dark-screen-only and uses the approved rounded surface', () => {
  const css = source('app/dark-glass.css');
  const start = css.indexOf("html[data-mantine-color-scheme='dark'] [data-page-heading-glass] {");
  assert.ok(start > css.indexOf('@media screen'));
  const rule = css.slice(start, css.indexOf('}', start));
  for (const declaration of [
    'background: var(--rev-glass-surface)',
    'border: 1px solid var(--rev-glass-line)',
    'border-radius: var(--mantine-radius-xl)',
    'padding: var(--mantine-spacing-lg)',
    'backdrop-filter: blur(18px) saturate(115%)',
  ]) assert.ok(rule.includes(declaration), declaration);
  assert.doesNotMatch(rule, /text-shadow|position: fixed|::before/);
  assert.match(css, /\.mantine-Group-root\[data-page-heading-glass\][^{]*\{\s*flex-wrap: wrap/);
});

test('shared and standalone page headings opt in without changing document or public layouts', () => {
  for (const path of [
    'components/dashboard/PageHeaderCard.tsx',
    'components/EmployeeProfile.tsx',
    'components/WarehouseInventoryPageClient.tsx',
    'app/page.tsx',
    'app/employees/page.tsx',
    'app/employees/activities/EmployeeActivitiesPanel.tsx',
    'app/employees/payroll/EmployeePayrollPanel.tsx',
    'app/employees/loans/page.tsx',
    'app/employees/whatsapp-reports/page.tsx',
    'app/billing/annexes/page.tsx',
    'app/billing/annexes/consolidado/page.tsx',
    'app/billing/price-list/page.tsx',
    'app/customers/page.tsx',
    'app/providers/page.tsx',
    'app/fuel/page.tsx',
    'app/inventory/hour-meter/page.tsx',
    'app/inventory/ledger/page.tsx',
    'app/inventory/maintenance/page.tsx',
    'app/inventory/provider-pickups/page.tsx',
    'app/inventory/provider-returns/page.tsx',
    'app/mobility-guides/page.tsx',
    'app/notifications/deliveries/page.tsx',
    'app/office-assistant/page.tsx',
    'app/settings/warehouse-tablets/page.tsx',
    'app/transport/driver-worksites/page.tsx',
    'app/transport/vehicles/page.tsx',
    'app/transport/worksites/page.tsx',
  ]) assert.ok(source(path).includes('data-page-heading-glass'), path);
  for (const path of ['app/login/page.tsx', 'app/privacy/page.tsx', 'app/documents/shared/[shareToken]/page.tsx']) {
    assert.ok(!source(path).includes('data-page-heading-glass'), path);
  }
});
