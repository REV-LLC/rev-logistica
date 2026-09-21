import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { canOptimizeImage } from './image-policy.ts';

const require = createRequire(import.meta.url);
const config = require('../../next.config.js');
const bases = config.env.NEXT_PUBLIC_IMAGE_BASE_URLS;

test('public inventory uses the same allowlist as the Next optimizer', () => {
  for (const base of bases.split(',')) {
    const url = new URL(`${base.replace(/\/+$/, '')}/assets/photo.jpg`);
    assert.equal(canOptimizeImage(url.href, bases), true);
    const pattern = config.images.remotePatterns.find((entry) => entry.hostname === url.hostname);
    assert.equal(pattern.protocol, 'https');
    assert.equal(pattern.port, url.port);
    assert.ok(url.pathname.startsWith(pattern.pathname.slice(0, -2)));
    assert.equal(pattern.search, '');
  }
});

test('browser-only and protected sources never enter the shared optimizer cache', () => {
  for (const src of ['blob:https://app.example/id', 'data:image/png;base64,AA==', '/api/employees/1/photo', '/files/1/download', '//other.example/a.jpg', 'https://other.example/a.jpg']) {
    assert.equal(canOptimizeImage(src, bases), false, src);
  }
  const base = bases.split(',')[0].replace(/\/+$/, '');
  assert.equal(canOptimizeImage(`${base}/photo.jpg?token=secret`, bases), false);
  assert.equal(canOptimizeImage(`${base.replace('https:', 'http:')}/photo.jpg`, bases), false);
  assert.equal(canOptimizeImage(`${base.replace('https://', 'https://user:password@')}/photo.jpg`, bases), false);
});

test('path-scoped origins cannot optimize other folders or lookalike hosts', () => {
  const allowed = 'https://cdn.example/inventory';
  assert.equal(canOptimizeImage(`${allowed}/one.jpg`, allowed), true);
  for (const src of ['https://cdn.example/private/one.jpg', 'https://cdn.example/inventory-other/one.jpg', 'https://cdn.example.evil/inventory/one.jpg', 'https://cdn.example/inventory/../private/one.jpg']) {
    assert.equal(canOptimizeImage(src, allowed), false);
  }
});

test('local raster assets are optimized while SVG stays vector', () => {
  assert.equal(canOptimizeImage('/inventory/skid-steer-loader.png'), true);
  assert.equal(canOptimizeImage('/login/excavator.webp'), true);
  assert.equal(canOptimizeImage('/pwa-192.png'), true);
  assert.equal(canOptimizeImage('/fiesta.svg?v=silver'), false);
});
