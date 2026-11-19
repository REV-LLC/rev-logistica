import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadTransportModule } from '../components/transport/test-support.cjs';

const { buildNavigationSearchEntries, searchNavigation } = loadTransportModule('../../lib/navigation-search.ts');
const entries = buildNavigationSearchEntries([
  { title: 'Accesos rápidos', links: [
    { href: '/employees', label: 'Empleados' },
    { href: '/transport/tracking', label: 'Mapa' },
  ] },
  { title: 'Gestión', links: [
    { href: '/employees', label: 'Empleados', children: [
      { href: '/employees', label: 'Directorio' },
      { href: '/employees/payroll', label: 'Nómina' },
    ] },
    { href: '/providers', label: 'Proveedores' },
  ] },
]);

test('includes nested pages once and keeps parent context searchable', () => {
  assert.equal(entries.filter(entry => entry.href === '/employees').length, 1);
  assert.equal(searchNavigation(entries, 'empleados nomina')[0].href, '/employees/payroll');
  assert.equal(searchNavigation(entries, 'directorio')[0].href, '/employees');
});

test('matches accents, capitalization, whitespace and familiar aliases', () => {
  assert.equal(searchNavigation(entries, '  NOMINA  ')[0].label, 'Nómina');
  assert.equal(searchNavigation(entries, 'ubicación camiones')[0].label, 'Mapa');
});

test('does not introduce routes outside the authorized sidebar entries', () => {
  const driver = buildNavigationSearchEntries([{ title: 'Operación', links: [
    { href: '/transport/generate', label: 'Generar documento' },
  ] }]);
  assert.equal(searchNavigation(driver, 'nomina').length, 0);
  assert.equal(searchNavigation(driver, 'mapa').length, 0);
  assert.equal(searchNavigation(driver, 'remision')[0].href, '/transport/generate');
});

test('empty and unknown queries have predictable results', () => {
  assert.equal(searchNavigation(entries, '').length, entries.length);
  assert.deepEqual(searchNavigation(entries, 'zzzz'), []);
  assert.equal(searchNavigation(entries, 'empleados')[0].label, 'Empleados');
});

test('Mapa is a visible Operations link for Admin and Office, not only an unrendered quick link', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  const operations = nav.slice(nav.indexOf('title: "Operación"'), nav.indexOf('title: "Inventario"'));
  assert.match(operations, /href: "\/transport\/tracking",\s+label: "Mapa",\s+icon: IconMap2,\s+roles: \["ADMIN", "OFFICE"\]/);
  assert.equal((nav.match(/label: "Mapa"/g) ?? []).length, 1);
});

test('REV navigation omits personal attendance while retaining Admin and Office attendance management', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(nav, /href:\s*["']\/attendance["']/);
  assert.doesNotMatch(nav, /label:\s*["']Mi asistencia["']/);
  assert.match(nav, /href: "\/employees\/attendance",\s+label: "Asistencia y rostros",\s+icon: IconUsers,\s+roles: \["ADMIN", "OFFICE"\]/);
});

test('WhatsApp reports, tasks and notifications belong to Tools with unchanged permissions and routes', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  const sections = nav.slice(nav.indexOf('const sections:'), nav.indexOf('const toolLinks:'));
  const tools = nav.slice(nav.indexOf('const toolLinks:'), nav.indexOf('const prodDisabledRoutes'));
  for (const href of ['/employees/whatsapp-reports', '/tasks', '/notifications/deliveries']) {
    assert.ok(!sections.includes(`href: "${href}"`));
    assert.ok(tools.includes(`href: "${href}"`));
    assert.equal(nav.split(`href: "${href}"`).length - 1, 1);
  }
  assert.equal((tools.match(/roles: \["ADMIN", "OFFICE"\]/g) ?? []).length, 8);
});

test('hour meters and maintenance share one sidebar group while retaining individual permissions', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  assert.match(nav, /label: "Horómetros y mantenimientos",\s+icon: IconTools,\s+roles: \["ADMIN", "OFFICE", "OPERATOR"\],\s+children: \[/);
  assert.match(nav, /href: "\/inventory\/hour-meter",\s+label: "Horómetros",\s+icon: IconGauge,\s+roles: \["ADMIN", "OFFICE", "OPERATOR"\]/);
  assert.match(nav, /href: "\/inventory\/maintenance",\s+label: "Mantenimientos",\s+icon: IconTools,\s+roles: \["ADMIN", "OFFICE"\]/);
});

test('chat is a permanent, searchable Admin and Office sidebar link instead of a floating launcher', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../components/ResponsiveShell.tsx', import.meta.url), 'utf8');
  assert.match(nav, /const assistantLink: NavLinkItem = \{\s+href: "\/office-assistant",\s+label: "Chat · Asistente Office",\s+icon: IconMessageCircle,\s+roles: \["ADMIN", "OFFICE"\]/);
  assert.match(nav, /\[homeLink, profileLink, assistantLink, \.\.\.quickLinks\]\.filter\(canShowLink\)/);
  assert.match(nav, /canShowLink\(assistantLink\)[\s\S]*renderNavItem\(assistantLink\)[\s\S]*<ScrollArea/);
  assert.doesNotMatch(shell, /OfficeAssistantLauncher/);
  const chatEntries = buildNavigationSearchEntries([{ title: 'General', links: [
    { href: '/office-assistant', label: 'Chat · Asistente Office' },
  ] }]);
  assert.equal(searchNavigation(chatEntries, 'chat')[0].href, '/office-assistant');
});

test('personal profile is one direct searchable navigation link rather than an accordion or duplicated header button', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  assert.match(nav, /const profileLink: NavLinkItem = \{\s+href: "\/profile",\s+label: "Mi perfil"/);
  assert.match(nav, /canShowLink\(profileLink\) \? renderNavItem\(profileLink\)/);
  assert.doesNotMatch(nav, /title: ['"]Mi perfil['"]|Ver perfil/);
  assert.doesNotMatch(nav, /href: ['"]\/profile\?tab=/);
  const profileEntries = buildNavigationSearchEntries([{ title: 'General', links: [{ href: '/profile', label: 'Mi perfil' }] }]);
  assert.equal(searchNavigation(profileEntries, 'mi perfil')[0].href, '/profile');
});
