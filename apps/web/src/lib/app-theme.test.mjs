import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

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

test('document sheets and PDF viewers explicitly opt out of dark glass', () => {
  for (const file of [
    '../app/inventory/ledger/document/[documentId]/page.tsx',
    '../app/tools/quotation/page.tsx',
    '../app/tools/pdf-editor/PdfPreview.tsx',
    '../components/FileAttachmentsPanel.tsx',
    '../components/mobility-guides/MobilityGuideListModal.tsx',
    '../components/mobility-guides/ProviderMobilityGuidesPanel.tsx',
  ]) {
    assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /data-document-paper/, file);
  }
  const css = readFileSync(new URL('../app/dark-glass.css', import.meta.url), 'utf8');
  assert.match(css, /:not\(:where\(\[data-document-paper\]\)\)/);
  assert.match(css, /html \[data-document-paper\]\s*\{[^}]*color-scheme: light;[^}]*background: #fff !important;[^}]*color: #111;/);
});
