import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { loadTransportModule } from '../transport/test-support.cjs';

const { MantineProvider } = createRequire(import.meta.url)('@mantine/core');
const asset = { id: 'mixer', publicCode: 'QA-MIX-1', description: 'Mezcladora eléctrica', internalNumber: 6,
  sku: { name: 'Mezcladora', imageUrl: '/inventory/skid-steer-loader.png' }, warehouseOwner: { name: 'Bodega Principal' } };
const cssMocks = { './EquipmentSelect.module.css': {}, './AppImage.module.css': {} };
const { equipmentImage } = loadTransportModule('../equipment-motors/types.ts');
const Thumbnail = loadTransportModule('../equipment-motors/EquipmentThumbnail.tsx', cssMocks).default;
const render = element => renderToStaticMarkup(React.createElement(MantineProvider, {}, element));

test('thumbnail sources prefer the unit photo, then the template, without another API call', () => {
  assert.equal(equipmentImage({ ...asset, imageUrl: '/unit.png' }), '/unit.png');
  assert.equal(equipmentImage({ ...asset, imageFileObject: { storageKey: '/own.png' } }), '/own.png');
  assert.equal(equipmentImage({ ...asset, sku: { ...asset.sku, imageFileObject: { storageKey: '/template.png' } } }), '/template.png');
  assert.equal(equipmentImage(asset), '/inventory/skid-steer-loader.png');
  assert.equal(equipmentImage({ ...asset, imageUrl: ' ', sku: { name: 'Sin foto' } }), null);
});

test('Next image thumbnails declare a fixed 32px footprint, lazy loading and async decoding', () => {
  const markup = render(React.createElement(Thumbnail, { equipment: asset }));
  for (const attribute of ['width="32"', 'height="32"', 'sizes="32px"', 'loading="lazy"', 'decoding="async"', '/_next/image?'])
    assert.ok(markup.includes(attribute), attribute);
  assert.ok(!markup.includes('fetchPriority="high"'));
});

test('equipment without a photo renders a fallback, not an empty or broken image', () => {
  const markup = render(React.createElement(Thumbnail, { equipment: { ...asset, sku: { name: 'Sin foto' } } }));
  assert.ok(markup.includes('data-equipment-thumbnail'));
  assert.ok(markup.includes('<svg'));
  assert.ok(!markup.includes('<img'));
});

test('private URLs stay outside the shared Next image optimizer', () => {
  const markup = render(React.createElement(Thumbnail, { equipment: { ...asset, imageUrl: 'https://private.example/photo?token=private' } }));
  assert.ok(markup.includes('src="https://private.example/photo?token=private"'));
  assert.ok(!markup.includes('/_next/image?'));
});

test('selected photo chips preserve the full accessible identity and do not render dropdown photos while closed', () => {
  const Selector = loadTransportModule('../equipment-motors/EquipmentCompatibilitySelect.tsx', {
    ...cssMocks,
    './use-motor-options': { useMotorOptions: () => ({ items: [{ ...asset, id: 'other' }], search: '', hasMore: false,
      loading: false, error: '', onSearch() {}, next() {} }) },
  }).default;
  const markup = render(React.createElement(Selector, { value: [asset.id], seeds: [asset], disabled: false, onChange() {} }));
  assert.equal((markup.match(/data-equipment-thumbnail/g) ?? []).length, 1);
  assert.ok(markup.includes('Mezcladora eléctrica #6'));
  assert.ok(markup.includes('Bodega Principal'));
  assert.ok(markup.includes('aria-label="Quitar Mezcladora eléctrica #6 · Bodega Principal"'));
  assert.ok(!markup.includes('role="option"'));
});
