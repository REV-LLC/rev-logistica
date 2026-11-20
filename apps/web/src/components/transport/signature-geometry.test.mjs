import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadTransportModule } = require("./test-support.cjs");
const { signaturePoint } = loadTransportModule("./signature-geometry.ts");

test("signature coordinates follow a clockwise landscape canvas in portrait phones", () => {
  const rect = { left: 20, top: 60, right: 300, width: 280, height: 700 };
  assert.deepEqual(signaturePoint(300, 60, rect, 700, 280, true), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(signaturePoint(20, 760, rect, 700, 280, true), {
    x: 700,
    y: 280,
  });
  assert.deepEqual(signaturePoint(160, 410, rect, 700, 280, true), {
    x: 350,
    y: 140,
  });
});

test("signature coordinates stay unrotated on landscape phones and desktop", () => {
  const rect = { left: 20, top: 60, right: 720, width: 700, height: 280 };
  assert.deepEqual(signaturePoint(370, 200, rect, 700, 280, false), {
    x: 350,
    y: 140,
  });
  assert.deepEqual(signaturePoint(720, 340, rect, 1400, 560, false), {
    x: 1400,
    y: 560,
  });
});
