import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('employee thumbnails and full-size portraits always use a true circular radius', () => {
  const source = readFileSync(new URL('../components/EmployeeAvatar.tsx', import.meta.url), 'utf8');
  assert.match(source, /radius="50%"/);
  assert.doesNotMatch(source, /radius=\{fullSize/);
  assert.match(source, /<Skeleton[^>]*circle height=\{size\} width=\{size\}/);
});

test('employee photo button remains square with a circular outline at every avatar size', () => {
  const source = readFileSync(new URL('../components/EmployeePhotoControl.tsx', import.meta.url), 'utf8');
  const button = source.slice(source.indexOf('component="button"'), source.indexOf('<EmployeeAvatar'));
  assert.match(button, /borderRadius:\s*'50%'/);
  assert.match(button, /width:\s*size/);
  assert.match(button, /height:\s*size/);
});

test('employee photos share a circular clipping rule in thumbnails, profile and expanded preview', () => {
  for (const component of ['EmployeeAvatar', 'EmployeePhotoModal']) {
    const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /import photoShape from ['"]\.\/EmployeePhotoShape\.module\.css['"]/);
    assert.match(source, /className=\{photoShape\.circle\}/);
  }
  const css = readFileSync(new URL('../components/EmployeePhotoShape.module.css', import.meta.url), 'utf8');
  assert.match(css, /aspect-ratio:\s*1;/);
  assert.match(css, /border-radius:\s*50%;/);
  assert.match(css, /overflow:\s*hidden;/);
  assert.match(css, /clip-path:\s*circle\(50%\);/);
});

test('expanded photo viewer overrides dark modal glass without a card behind the portrait', () => {
  const css = readFileSync(new URL('../components/ProfilePhotoLightbox.module.css', import.meta.url), 'utf8');
  assert.match(css, /:global\(html\[data-mantine-color-scheme='dark'\]\) \.content\.content/);
  for (const rule of ['background: transparent', 'border: 0', 'box-shadow: none', 'backdrop-filter: none']) {
    assert.ok(css.includes(`${rule} !important;`));
  }
});

test('wide employee directories use four columns and a larger scoped container', () => {
  const css = readFileSync(new URL('../app/employees/directory.module.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../app/employees/page.tsx', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width: 100em\)[\s\S]*\.directoryContainer\.directoryContainer \{ max-width: 1760px; \}[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(page, /className=\{styles.employeeGrid\}/);
  assert.match(page, /styles.directoryContainer/);
});
