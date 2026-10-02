import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { loadTransportModule } from "../transport/test-support.cjs";

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
const Box = ({ children }) => React.createElement("div", {}, children);
const Options = loadTransportModule(
  "../equipment-configuration/ConfigurationEntryOptions.tsx",
  {
    "@mantine/core": {
      Button: ({ children, onClick, disabled }) =>
        React.createElement("button", { onClick, disabled }, children),
      Checkbox: ({ label, checked, onChange, disabled }) =>
        React.createElement(
          "label",
          {},
          label,
          React.createElement("input", {
            type: "checkbox",
            checked,
            onChange,
            disabled,
          }),
        ),
      NumberInput: ({ label, value, onChange }) =>
        React.createElement(
          "label",
          {},
          label,
          React.createElement("input", {
            type: "number",
            value,
            onChange: (event) => onChange(Number(event.currentTarget.value)),
          }),
        ),
      TextInput: ({ label, value, onChange }) =>
        React.createElement(
          "label",
          {},
          label,
          React.createElement("input", { value, onChange }),
        ),
      Modal: Box,
      Group: Box,
      Stack: Box,
      Text: Box,
      Divider: Box,
      Select: Box,
    },
  },
).default;
const individual = {
  id: "row",
  role: "ACCESSORY",
  accessoryId: "part",
  quantity: 1,
  maximumQuantity: 1,
  defaultIncluded: true,
  required: false,
  accessory: {
    id: "part",
    name: "Implemento Y",
    kind: "INDIVIDUAL",
    purpose: "ACCESSORY",
  },
};
async function fixture(entry = individual, extra = {}) {
  const applied = [],
    removed = [],
    cancelled = [],
    configured = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  await act(() =>
    root.render(
      React.createElement(Options, {
        entry,
        creating: false,
        accessoryParent: false,
        onApply: (value) => applied.push(value),
        onRemove: () => removed.push(true),
        onCancel: () => cancelled.push(true),
        onConfigurePart: () => configured.push(true),
        ...extra,
      }),
    ),
  );
  return {
    container,
    applied,
    removed,
    cancelled,
    configured,
    click: (label) =>
      act(() =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === label)
          .click(),
      ),
    toggle: () =>
      act(() => container.querySelector("input[type=checkbox]").click()),
  };
}
test("individual options hide quantity controls and preserve the stored identity and limits", async () => {
  const f = await fixture();
  assert.equal(f.container.querySelectorAll("input[type=number]").length, 0);
  await f.toggle();
  await f.click("Aplicar");
  assert.equal(f.applied[0].defaultIncluded, false);
  assert.equal(f.applied[0].accessoryId, "part");
  assert.equal(f.applied[0].maximumQuantity, 1);
  assert.equal(
    individual.defaultIncluded,
    true,
    "draft never mutates the parent",
  );
});
test("cancelled options never reach the parent configuration", async () => {
  const f = await fixture();
  await f.toggle();
  await f.click("Cancelar");
  assert.equal(f.cancelled.length, 1);
  assert.deepEqual(f.applied, []);
});
test("a single-unit family has no default-unit checkbox or quantity controls", async () => {
  const f = await fixture({
    id: "family-row",
    role: "ACCESSORY",
    familyId: "family-y",
    family: { name: "Familia Y", controlType: "SERIAL" },
    quantity: 1,
    maximumQuantity: 1,
    defaultIncluded: false,
    required: false,
  });
  assert.equal(f.container.querySelectorAll("input[type=checkbox]").length, 1);
  assert.equal(f.container.querySelectorAll("input[type=number]").length, 0);
  await f.click("Aplicar");
  assert.equal(f.applied[0].familyId, "family-y");
  assert.equal(f.applied[0].defaultIncluded, false);
});
test("consumables and multi-unit families retain editable quantities", async () => {
  for (const entry of [
    {
      ...individual,
      quantity: 2,
      maximumQuantity: 8,
      accessory: { ...individual.accessory, kind: "CONSUMABLE" },
    },
    {
      id: "family-row",
      role: "ACCESSORY",
      familyId: "family-y",
      family: { name: "Familia Y", controlType: "SERIAL" },
      quantity: 2,
      maximumQuantity: 4,
      defaultIncluded: false,
      required: false,
    },
  ]) {
    const f = await fixture(entry);
    assert.equal(f.container.querySelectorAll("input[type=number]").length, 2);
    await f.click("Aplicar");
    assert.equal(f.applied[0].quantity, 2);
  }
});
test("nested navigation and unlinking cannot silently discard draft changes or history", async () => {
  const f = await fixture();
  await f.toggle();
  window.confirm = () => false;
  await f.click("Conjunto y cobro");
  await f.click("Desvincular del equipo");
  assert.deepEqual(f.configured, []);
  assert.deepEqual(f.removed, []);
  window.confirm = () => true;
  await f.click("Conjunto y cobro");
  assert.equal(f.configured.length, 1);
});
test("a new part is not persisted or linked until explicitly applied", async () => {
  const entry = {
    id: "new-row",
    role: "ACCESSORY",
    quantity: 2,
    defaultIncluded: false,
    required: false,
    newPart: {
      name: "Consumible Z",
      kind: "CONSUMABLE",
      initialQuantity: 10,
      compatibility: "FAMILY",
      exclusive: false,
    },
  };
  const f = await fixture(entry, { creating: true });
  assert.ok(!f.container.textContent.includes("Desvincular del equipo"));
  await f.click("Agregar al conjunto");
  assert.deepEqual(f.applied, [entry]);
});
