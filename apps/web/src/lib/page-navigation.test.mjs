import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPageNavigation } from './page-navigation.ts';

const current = 'https://rev.example/employees?active=1';
const click = { href: '/employees/123', defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

test('internal page and query changes show the shared transition', () => {
  assert.equal(isPageNavigation(click, current), true);
  assert.equal(isPageNavigation({ ...click, href: '/inventory/serialized-assets' }, current), true);
  assert.equal(isPageNavigation({ ...click, href: '?active=0' }, current), true);
  assert.equal(isPageNavigation({ ...click, target: '_self' }, current), true);
});

test('same page and anchor-only links never leave a loading overlay behind', () => {
  for (const href of [current, '#details', '/employees?active=1#details']) {
    assert.equal(isPageNavigation({ ...click, href }, current), false);
  }
});

test('external links, downloads, and other tabs do not cover the current page', () => {
  for (const change of [
    { href: 'https://other.example/employees' }, { href: 'mailto:office@example.com' },
    { href: 'tel:123' }, { href: 'javascript:void(0)' }, { download: true },
    { target: '_blank' }, { target: 'print-preview' },
  ]) assert.equal(isPageNavigation({ ...click, ...change }, current), false);
});

test('modified, non-primary and already canceled clicks are ignored', () => {
  for (const change of [
    { defaultPrevented: true }, { button: 1 }, { button: 2 },
    { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true },
  ]) assert.equal(isPageNavigation({ ...click, ...change }, current), false);
});
