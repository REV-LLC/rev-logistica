import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("mobile sidebar owns its opacity instead of inheriting a page-dependent glass setting", () => {
  const css = readFileSync(new URL("../components/ResponsiveShell.module.css", import.meta.url), "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 47.99em)"), css.indexOf("@media (prefers-reduced-motion"));
  assert.match(mobile, /\.navbar\s*\{[^}]*--sidebar-glass-opacity:\s*\.96;/);
  assert.match(css, /background:\s*rgb\(3 20 38 \/ var\(--sidebar-glass-opacity\)\)/);
  assert.match(css, /\.shell:has\(\[data-page-background='dark'\]\)\s*\{\s*--sidebar-glass-opacity:\s*\.48;/);
});
