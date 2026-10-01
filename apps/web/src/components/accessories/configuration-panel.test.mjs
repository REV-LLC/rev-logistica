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
async function fixture(failSave = false) {
  const controls = {},
    calls = [],
    navigated = [],
    busy = [];
  const Box = ({ children }) => React.createElement("div", {}, children);
  const Tabs = Object.assign(Box, { List: Box, Tab: Box });
  const Panel = loadTransportModule(
    "../equipment-configuration/ConfigurationPanel.tsx",
    {
      "@mantine/core": {
        Alert: Box,
        Group: Box,
        Stack: Box,
        Loader: Box,
        Text: Box,
        Tabs,
        Button: ({ children, onClick, disabled }) =>
          React.createElement("button", { onClick, disabled }, children),
      },
      "./ConfigurationNavigator": ({ root, renderOwner }) =>
        renderOwner(root, {
          onDirtyChange() {},
          onBusyChange: (value) => busy.push(value),
          onConfigurePart: (value) => navigated.push(value),
        }),
      "./ConfigurationEditor": (props) => {
        controls.editor = props;
        return null;
      },
      "../commercial-profiles/CommercialProfilePanel": () => null,
      "@/lib/api": {
        api: async (path, options = {}) => {
          calls.push({ path, ...options });
          if (options.method === "PUT") {
            if (failSave) throw Error("Conflicto: recarga antes de guardar");
            return {
              version: 2,
              entries: options.json.entries.map((row) => ({
                id: row.id,
                role: row.role,
                quantity: row.quantity,
                defaultIncluded: row.defaultIncluded,
                required: row.required,
                accessoryId: "persistent-y",
                accessory: {
                  id: "persistent-y",
                  name: row.newPart.name,
                  kind: "INDIVIDUAL",
                  purpose: "ACCESSORY",
                },
              })),
            };
          }
          return {
            version: 1,
            entries: [],
            parent: {
              name: "Equipo X",
              familyId: "generic-family",
              warehouseId: "warehouse",
            },
          };
        },
      },
    },
  ).default;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  await act(async () => {
    root.render(React.createElement(Panel, { assetId: "x" }));
  });
  await act(() =>
    controls.editor.onChange({
      ...controls.editor.value,
      entries: [
        {
          id: "stable-row",
          role: "ACCESSORY",
          quantity: 1,
          defaultIncluded: true,
          required: false,
          newPart: {
            name: "Implemento Y",
            kind: "INDIVIDUAL",
            initialQuantity: 1,
            exclusive: false,
            compatibility: "PARENT",
          },
        },
      ],
    }),
  );
  return {
    controls,
    calls,
    navigated,
    busy,
    container,
    enter: () =>
      act(async () => {
        controls.editor.onConfigurePart("stable-row");
        await new Promise((resolve) => setImmediate(resolve));
      }),
    allowSave: () => {
      failSave = false;
    },
  };
}
test("save-and-configure persists the complete parent then opens only the returned persistent child identity", async () => {
  const f = await fixture();
  await f.enter();
  assert.equal(f.calls.filter((c) => c.method === "PUT").length, 1);
  assert.equal(f.calls.find((c) => c.method === "PUT").json.version, 1);
  assert.equal(
    f.calls.find((c) => c.method === "PUT").json.entries[0].id,
    "stable-row",
  );
  assert.deepEqual(f.navigated, [
    { accessoryId: "persistent-y", label: "Implemento Y" },
  ]);
  assert.deepEqual(f.busy, [true, false]);
});
test("failed parent persistence retains the new part draft, never opens a child and allows a safe retry", async () => {
  const f = await fixture(true);
  await f.enter();
  assert.deepEqual(f.navigated, []);
  assert.match(f.container.textContent, /Conflicto/);
  assert.equal(f.controls.editor.value.entries[0].newPart.name, "Implemento Y");
  f.allowSave();
  await f.enter();
  assert.deepEqual(f.navigated, [
    { accessoryId: "persistent-y", label: "Implemento Y" },
  ]);
  assert(
    f.calls
      .filter((c) => c.method === "PUT")
      .every((c) => c.path === "/equipment-configurations/assets/x"),
  );
});
