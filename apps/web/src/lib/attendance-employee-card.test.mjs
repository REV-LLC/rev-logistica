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
async function fixture(overrides = {}) {
  const selected = [],
    identities = [];
  const box = ({ children }) => React.createElement("div", null, children);
  const Card = loadTransportModule(
    "../../app/employees/attendance/components/AttendanceEmployeeCard.tsx",
    {
      "@mantine/core": {
        Badge: box,
        Group: box,
        Stack: box,
        Paper: ({ children, "aria-label": label }) =>
          React.createElement("article", { "aria-label": label }, children),
        Text: ({ children, title }) =>
          React.createElement("div", { title }, children),
        Button: ({ children, onClick, "aria-label": label }) =>
          React.createElement(
            "button",
            { onClick, "aria-label": label },
            children,
          ),
      },
      "@/components/EmployeeCard": {
        getEmployeeCardFullName: (employee) =>
          `${employee.name} ${employee.lastName}`.trim(),
        EmployeeCardIdentity: (props) => {
          identities.push(props);
          return React.createElement(
            "div",
            null,
            `${props.employee.name} ${props.employee.lastName}`,
          );
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
      React.createElement(Card, {
        employee: {
          id: "employee",
          name: "ANA MARÍA",
          lastName: "APELLIDO LARGO DE PRUEBA",
          active: true,
          role: "MACHINIST",
          journeys: 0,
          open: 0,
          pendingReview: 0,
          reportedHours: 0,
          latestWorksite: null,
          lastEntry: null,
          lastExit: null,
          ...overrides,
        },
        onSelect: (id) => selected.push(id),
      }),
    ),
  );
  return {
    container,
    selected,
    identities,
    click: () => act(() => container.querySelector("button").click()),
  };
}
test("one attendance card owns the compact identity, empty state and employee-selection command", async () => {
  const f = await fixture();
  assert.equal(f.identities[0].nameLines, 2);
  assert.equal(f.identities[0].photoSize, 48);
  assert.match(f.container.textContent, /Sin obra reportada en el período/);
  assert.match(
    f.container.textContent,
    /Sin reportes. No se interpreta como ausencia/,
  );
  assert.doesNotMatch(
    f.container.textContent,
    /sin salida|por revisar|Inactivo/,
  );
  assert.equal(
    f.container.querySelector("button").getAttribute("aria-label"),
    "Ver jornadas de ANA MARÍA APELLIDO LARGO DE PRUEBA",
  );
  await f.click();
  assert.deepEqual(f.selected, ["employee"]);
});
test("the card renders supplied attendance metadata and Colombia dates without fetching its own data", async () => {
  const f = await fixture({
    active: false,
    journeys: 5,
    open: 1,
    pendingReview: 2,
    reportedHours: 12.345,
    latestWorksite: "OBRA CENTRAL",
    lastEntry: "2026-11-19T02:00:00Z",
    lastExit: "2026-11-19T03:00:00Z",
  });
  for (const text of [
    "Inactivo",
    "5 jornadas",
    "1 sin salida",
    "2 por revisar",
    "12.35 h",
    "OBRA CENTRAL",
    "18/11/26",
  ])
    assert.ok(f.container.textContent.includes(text), text);
  assert.equal(
    f.container.querySelector('[title="OBRA CENTRAL"]').textContent,
    "OBRA CENTRAL",
  );
});
