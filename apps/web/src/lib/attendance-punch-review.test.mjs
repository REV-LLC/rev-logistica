import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { loadTransportModule } from "../components/transport/test-support.cjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const mounts = [];
afterEach(async () => {
  for (const { root, container } of mounts.splice(0)) {
    await act(() => root.unmount());
    container.remove();
  }
});
const punch = (kind) => ({
  id: kind,
  kind,
  status: "VERIFIED",
  occurredAt: "2026-11-19T12:00:00Z",
  accuracyMeters: 12,
  distanceMeters: null,
  reasons: [],
  reviewNote: null,
  employee: {
    name: kind === "CHECK_IN" ? "ENTRADA QA" : "SALIDA QA",
    lastName: "PRUEBA",
  },
  customerWorksite: {
    alias: null,
    worksite: { name: "OBRA" },
    customer: { name: "CLIENTE" },
  },
});
async function fixture(api) {
  const controls = {};
  const box = ({ children }) => React.createElement("div", null, children);
  const Panel = loadTransportModule(
    "../../app/employees/attendance/components/AttendancePunchReview.tsx",
    {
      "@/lib/api": { api },
      "./AttendanceLocationMap": () => null,
      "./AttendanceEvidencePhoto": () => null,
      "@mantine/core": {
        Alert: box,
        Badge: box,
        Group: box,
        Paper: box,
        Stack: box,
        Text: box,
        Loader: () => React.createElement("span", null, "Cargando"),
        Modal: ({ opened, children }) => (opened ? box({ children }) : null),
        Textarea: () => null,
        Select: (props) => {
          controls[props.label] = props;
          return null;
        },
        Button: ({ children, onClick, disabled }) =>
          React.createElement("button", { onClick, disabled }, children),
      },
    },
  ).default;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  await act(async () => root.render(React.createElement(Panel)));
  return {
    container,
    select: (value) =>
      act(async () => controls["Tipo de marcación"].onChange(value)),
  };
}
test("a delayed entry response cannot replace the selected exit filter", async () => {
  let resolveEntry;
  const calls = [];
  const f = await fixture((path) => {
    calls.push(path);
    return path.includes("CHECK_IN")
      ? new Promise((resolve) => {
          resolveEntry = resolve;
        })
      : Promise.resolve([punch("CHECK_OUT")]);
  });
  await f.select("CHECK_OUT");
  assert.match(f.container.textContent, /SALIDA QA/);
  await act(async () => resolveEntry([punch("CHECK_IN")]));
  assert.doesNotMatch(f.container.textContent, /ENTRADA QA/);
  assert.match(f.container.textContent, /SALIDA QA/);
  assert.deepEqual(calls, [
    "/attendance/punches?kind=CHECK_IN",
    "/attendance/punches?kind=CHECK_OUT",
  ]);
});
test("unexpected mixed API responses never render both entry and exit rows", async () => {
  const f = await fixture(async () => [punch("CHECK_IN"), punch("CHECK_OUT")]);
  assert.match(f.container.textContent, /ENTRADA QA/);
  assert.doesNotMatch(f.container.textContent, /SALIDA QA/);
  await f.select("CHECK_OUT");
  assert.match(f.container.textContent, /SALIDA QA/);
  assert.doesNotMatch(f.container.textContent, /ENTRADA QA/);
});
