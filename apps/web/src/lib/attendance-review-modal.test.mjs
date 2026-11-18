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
async function fixture(overrides = {}, fail = false) {
  const calls = [], controls = {};
  let completed = 0;
  const box = ({ children }) => React.createElement("div", null, children);
  const Component = loadTransportModule("../../app/employees/attendance/components/AttendanceReportReviewModal.tsx", {
    "@mantine/core": {
      Alert: box, Badge: box, Group: box, Modal: box, Paper: box,
      SimpleGrid: box, Stack: box, Text: box,
      Button: ({ children, onClick, disabled, loading }) => React.createElement("button", { onClick, disabled: disabled || loading }, children),
      SegmentedControl: props => { controls.decision = props; return null; },
    },
    "./AttendanceEvidencePhoto": () => null,
    "@/lib/api": { api: async (path, options) => {
      calls.push({ path, ...options });
      if (fail) throw new Error("Conflicto de revisión");
      return {};
    } },
  }).default;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  await act(() => root.render(React.createElement(Component, {
    journal: { id: "journey", enteredAt: "2026-11-18T12:00:00Z", leftAt: "2026-11-18T20:00:00Z",
      checkInReport: null, checkOutReport: null,
      activityNote: { id: "note", reviewStatus: "SUGGESTED", description: "Asistencia reportada" },
      customerWorksite: { worksite: { name: "Obra" }, customer: { name: "Cliente" } }, ...overrides },
    employeeId: "employee", employeeName: "Empleado de prueba", onClose() {}, onReviewed() { completed++; },
  })));
  return { calls, container, completed: () => completed,
    button: label => [...container.querySelectorAll("button")].find(button => button.textContent === label),
    select: value => act(() => controls.decision.onChange(value)),
    click: label => act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label).click()),
  };
}
test("confirms the selected employee note through the audited review endpoint", async () => {
  const f = await fixture();
  await f.click("Confirmar revisión");
  assert.equal(f.calls[0].path, "/employee-activities/employee/note/review");
  assert.equal(f.calls[0].method, "PATCH");
  assert.deepEqual(f.calls[0].json, { action: "CONFIRM" });
  assert.equal(f.completed(), 1);
});
test("discard does not delete source reports", async () => {
  const f = await fixture();
  await f.select("DISMISS");
  await f.click("Descartar revisión");
  assert.deepEqual(f.calls.map(call => [call.method, call.json.action]), [["PATCH", "DISMISS"]]);
});
test("open, invalidated, deleted and dismissed journeys cannot be confirmed", async () => {
  for (const override of [
    { leftAt: null },
    { activityNote: { id: "note", sourceInvalidatedAt: "2026-11-18", reviewStatus: "SUGGESTED" } },
    { checkInReport: { deletedAt: "2026-11-18" } },
    { activityNote: { id: "note", reviewStatus: "DISMISSED" } },
    { activityNote: null },
  ]) {
    const f = await fixture(override);
    assert.equal(f.button("Confirmar revisión").disabled, true);
    await f.click("Confirmar revisión");
    assert.equal(f.calls.length, 0);
  }
});
test("failed review stays open with the API error and can be retried", async () => {
  const f = await fixture({}, true);
  await f.click("Confirmar revisión");
  assert.match(f.container.textContent, /Conflicto de revisión/);
  assert.equal(f.completed(), 0);
  assert.equal(f.button("Confirmar revisión").disabled, false);
});
