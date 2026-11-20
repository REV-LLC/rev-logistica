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
  const calls = [],
    controls = {};
  let completed = 0;
  const box = ({ children }) => React.createElement("div", null, children);
  const Component = loadTransportModule(
    "../../app/employees/attendance/components/AttendanceReportReviewModal.tsx",
    {
      "@mantine/core": {
        Alert: box,
        Badge: box,
        Group: box,
        Modal: box,
        Paper: box,
        SimpleGrid: box,
        Stack: box,
        Text: box,
        Tooltip: box,
        ActionIcon: ({ children, onClick, disabled, "aria-label": label }) =>
          React.createElement(
            "button",
            { onClick, disabled, "aria-label": label },
            children,
          ),
        Button: ({ children, onClick, disabled, loading }) =>
          React.createElement(
            "button",
            { onClick, disabled: disabled || loading },
            children,
          ),
        TextInput: ({ label, value, onChange, disabled }) => {
          controls[label] = { onChange };
          return React.createElement(
            "label",
            null,
            label,
            React.createElement("input", {
              "aria-label": label,
              value,
              onChange,
              disabled,
            }),
          );
        },
      },
      "./AttendanceEvidencePhoto": ({ punchId, fileId, label }) =>
        React.createElement(
          "div",
          { "data-punch-photo": punchId, "data-file-photo": fileId },
          label,
        ),
      "@/lib/api": {
        api: async (path, options) => {
          calls.push({ path, ...options });
          if (fail) throw new Error("Conflicto de revisión");
          return {};
        },
      },
    },
  ).default;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  await act(() =>
    root.render(
      React.createElement(Component, {
        journal: {
          id: "journey",
          enteredAt: "2026-11-18T12:00:00Z",
          leftAt: "2026-11-18T20:00:00Z",
          checkInReport: null,
          checkOutReport: null,
          activityNote: {
            id: "note",
            reviewStatus: "SUGGESTED",
            description: "Asistencia reportada",
          },
          customerWorksite: {
            worksite: { name: "Obra" },
            customer: { name: "Cliente" },
          },
          ...overrides,
        },
        employeeId: "employee",
        employeeName: "Empleado de prueba",
        onClose() {},
        onReviewed() {
          completed++;
        },
      }),
    ),
  );
  return {
    calls,
    container,
    completed: () => completed,
    button: (label) =>
      [...container.querySelectorAll("button")].find(
        (button) =>
          (button.getAttribute("aria-label") ?? button.textContent) === label,
      ),
    change: (label, value) =>
      act(() => {
        controls[label].onChange({ currentTarget: { value } });
      }),
    select: (value) =>
      act(() =>
        [...container.querySelectorAll("button")]
          .find(
            (button) =>
              button.getAttribute("aria-label") ===
              { CORRECT: "Corregir", DISMISS: "Rechazar" }[value],
          )
          .click(),
      ),
    click: (label) =>
      act(async () =>
        [...container.querySelectorAll("button")]
          .find(
            (button) =>
              (button.getAttribute("aria-label") ?? button.textContent) ===
              label,
          )
          .click(),
      ),
  };
}

test('review modal displays corrected presence and retains original timestamps as evidence', async () => {
  const f = await fixture({
    enteredAt: '2026-11-14T12:00:00Z', leftAt: '2026-11-17T21:00:00Z',
    effective: { enteredAt: '2026-11-14T12:00:00Z', leftAt: '2026-11-14T21:00:00Z', hours: 9, corrected: true },
  });
  assert.match(f.container.textContent, /Presencia reportada: 9.00/);
  assert.match(f.container.textContent, /Registro original:/);
  assert.doesNotMatch(f.container.textContent, /81.00/);
});
test("confirms the selected employee note through the audited review endpoint", async () => {
  const f = await fixture();
  await f.click("Aprobar");
  assert.equal(f.calls[0].path, "/employee-activities/employee/note/review");
  assert.equal(f.calls[0].method, "PATCH");
  assert.deepEqual(f.calls[0].json, { action: "CONFIRM" });
  assert.equal(f.completed(), 1);
});
test("discard does not delete source reports", async () => {
  const f = await fixture();
  await f.select("DISMISS");
  await f.click("Confirmar rechazo");
  assert.deepEqual(
    f.calls.map((call) => [call.method, call.json.action]),
    [["PATCH", "DISMISS"]],
  );
});
test("open, invalidated, deleted and dismissed journeys cannot be confirmed", async () => {
  for (const override of [
    { leftAt: null },
    {
      activityNote: {
        id: "note",
        sourceInvalidatedAt: "2026-11-18",
        reviewStatus: "SUGGESTED",
      },
    },
    { checkInReport: { deletedAt: "2026-11-18" } },
    { activityNote: { id: "note", reviewStatus: "DISMISSED" } },
    { activityNote: null },
  ]) {
    const f = await fixture(override);
    assert.equal(f.button("Aprobar").disabled, true);
    await f.click("Aprobar");
    assert.equal(f.calls.length, 0);
  }
});
test("failed review stays open with the API error and can be retried", async () => {
  const f = await fixture({}, true);
  await f.click("Aprobar");
  assert.match(f.container.textContent, /Conflicto de revisión/);
  assert.equal(f.completed(), 0);
  assert.equal(f.button("Aprobar").disabled, false);
});

test("corrects only times through the audited endpoint without replacing the activity text", async () => {
  const f = await fixture();
  await f.select("CORRECT");
  await f.change("Entrada corregida", "2026-11-18T08:15");
  await f.change("Salida corregida", "2026-11-18T17:20");
  await f.click("Guardar corrección");
  assert.deepEqual(f.calls[0].json, {
    action: "CORRECT",
    verifiedEnteredAt: "2026-11-18T13:15:00.000Z",
    verifiedLeftAt: "2026-11-18T22:20:00.000Z",
  });
  assert.equal(f.calls[0].path, "/employee-activities/employee/note/review");
  assert.equal(f.completed(), 1);
});
test("correction errors retain the draft and never send an inverted time range", async () => {
  const f = await fixture();
  await f.select("CORRECT");
  await f.change("Salida corregida", "2026-11-18T06:00");
  await f.click("Guardar corrección");
  assert.equal(f.calls.length, 0);
  assert.match(f.container.textContent, /posterior a la entrada/);
  assert.equal(
    f.container.querySelector('input[aria-label="Salida corregida"]').value,
    "2026-11-18T06:00",
  );
});
test("an API error preserves the corrected time draft and does not close the modal", async () => {
  const f = await fixture({}, true);
  await f.select("CORRECT");
  await f.change("Entrada corregida", "2026-11-18T08:15");
  await f.click("Guardar corrección");
  assert.equal(f.completed(), 0);
  assert.match(f.container.textContent, /Conflicto de revisión/);
  assert.equal(
    f.container.querySelector('input[aria-label="Entrada corregida"]').value,
    "2026-11-18T08:15",
  );
});
test("a closed journey cannot lose its exit, while a dismissed note can be corrected", async () => {
  const f = await fixture({
    activityNote: {
      id: "note",
      reviewStatus: "DISMISSED",
      description: "Original",
    },
  });
  await f.select("CORRECT");
  await f.change("Salida corregida", "");
  await f.click("Guardar corrección");
  assert.equal(f.calls.length, 0);
  assert.match(f.container.textContent, /Completa la salida/);
  await f.change("Salida corregida", "2026-11-18T16:00");
  await f.click("Guardar corrección");
  assert.equal(f.calls[0].json.action, "CORRECT");
});

test("WhatsApp entry and exit locations render separate Google Maps previews even after verification", async () => {
  const report = (id, latitude, longitude) => ({
    id,
    location: { latitude, longitude },
    evidence: [],
    deletedAt: null,
  });
  const f = await fixture({
    checkInReport: report("entry", 3.43, -76.53),
    checkOutReport: report("exit", 3.49, -76.5),
    activityNote: {
      id: "note",
      reviewStatus: "CONFIRMED",
      description: "Jornada verificada",
    },
  });
  const frames = [...f.container.querySelectorAll("iframe")];
  assert.equal(frames.length, 2);
  assert.equal(frames[0].title, "Ubicación de entrada de WhatsApp");
  assert.equal(new URL(frames[0].src).searchParams.get("q"), "3.43,-76.53");
  assert.equal(frames[1].title, "Ubicación de salida de WhatsApp");
  assert.equal(new URL(frames[1].src).searchParams.get("q"), "3.49,-76.5");
});
test("all PWA statuses preserve the map for their own entry or exit", async () => {
  for (const status of ["VERIFIED", "APPROVED", "PENDING", "REJECTED"]) {
    const f = await fixture({
      punches: [
        {
          id: "entry",
          kind: "CHECK_IN",
          status,
          occurredAt: "2026-11-18T12:00:00Z",
          latitude: 3.43,
          longitude: -76.53,
          accuracyMeters: 12,
        },
        {
          id: "exit",
          kind: "CHECK_OUT",
          status,
          occurredAt: "2026-11-18T20:00:00Z",
          latitude: 3.49,
          longitude: -76.5,
          accuracyMeters: 19,
        },
      ],
    });
    const frames = [...f.container.querySelectorAll("iframe")];
    assert.deepEqual(
      frames.map((frame) => frame.title),
      ["Ubicación de entrada de PWA", "Ubicación de salida de PWA"],
    );
    assert.match(f.container.textContent, /Precisión del GPS: 12 m/);
    assert.match(f.container.textContent, /Precisión del GPS: 19 m/);
    assert.deepEqual(
      [...f.container.querySelectorAll("[data-punch-photo]")].map((el) => [
        el.dataset.punchPhoto,
        el.textContent,
      ]),
      [
        ["entry", "Selfie de entrada"],
        ["exit", "Selfie de salida"],
      ],
    );
  }
});
test("missing or invalid GPS never becomes an invented location; zero coordinates remain valid", async () => {
  const missing = await fixture();
  assert.equal(missing.container.querySelectorAll("iframe").length, 0);
  assert.match(missing.container.textContent, /Sin ubicación registrada/);
  const invalid = await fixture({
    checkInReport: {
      id: "entry",
      location: { latitude: 91, longitude: -76 },
      evidence: [],
    },
  });
  assert.equal(invalid.container.querySelectorAll("iframe").length, 0);
  const zero = await fixture({
    checkInReport: {
      id: "entry",
      location: { latitude: 0, longitude: 0 },
      evidence: [],
    },
  });
  assert.equal(
    new URL(zero.container.querySelector("iframe").src).searchParams.get("q"),
    "0,0",
  );
});
