import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadTransportModule } = require('../components/transport/test-support.cjs');
const { usesDarkGlassTheme, appThemeVariables } = loadTransportModule('../../lib/app-theme.ts', {
  '@mantine/core': { createTheme: (theme) => theme },
});

test('internal routes share the dark glass theme, including component previews', () => {
  for (const path of ['/', '/employees', '/inventory/warehouse', '/transport/generate', '/settings', '/component-lab/item-picker']) {
    assert.equal(usesDarkGlassTheme(path), true, path);
  }
});

test('public routes and their descendants retain their light theme', () => {
  for (const path of [null, '', '/login', '/privacy', '/actualizar-datos/token', '/documents/shared/token']) {
    assert.equal(usesDarkGlassTheme(path), false, String(path));
  }
  assert.equal(usesDarkGlassTheme('/login-history'), true);
});

test('shared tokens expose readable text and an opaque glass dialog surface', () => {
  const variables = appThemeVariables();
  assert.equal(variables.dark['--mantine-color-body'], '#343b40');
  assert.equal(variables.dark['--mantine-color-text'], '#f1f5f9');
  assert.equal(variables.variables['--rev-glass-overlay'], 'rgba(39, 47, 53, 0.94)');
  assert.deepEqual(variables.light, {});
});
