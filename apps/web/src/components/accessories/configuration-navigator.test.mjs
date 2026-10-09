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
const Navigator = loadTransportModule(
  "../equipment-configuration/ConfigurationNavigator.tsx",
  {
    "@mantine/core": {
      Alert: Box,
      Group: Box,
      Stack: Box,
      Text: Box,
      Button: ({ children, onClick, disabled }) =>
        React.createElement("button", { onClick, disabled }, children),
    },
  },
).default;
async function fixture() {
  let navigation, current;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounts.push({ root, container });
  await act(() =>
    root.render(
      React.createElement(Navigator, {
        root: { assetId: "x", label: "Equipo X" },
        renderOwner(location, handlers) {
          current = location;
          navigation = handlers;
          return React.createElement("p", {}, location.label);
        },
      }),
    ),
  );
  return {
    container,
    current: () => current,
    handlers: () => navigation,
    back: () =>
      act(() =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === "Volver a Equipo X")
          .click(),
      ),
  };
}
test("generic breadcrumb navigates X → Y → Z and blocks cycles by identity", async () => {
  const f = await fixture();
  assert.equal(f.container.querySelector('a[href="/inventory"]'), null, "no inventory return button in the configurator");
  assert.equal(f.container.querySelectorAll("button").length, 0, "no inert button on the root equipment");
  await act(() =>
    f.handlers().onConfigurePart({ accessoryId: "y", label: "Implemento Y" }),
  );
  await act(() =>
    f.handlers().onConfigurePart({ accessoryId: "z", label: "Consumible Z" }),
  );
  assert.equal(f.current().accessoryId, "z");
  await act(() =>
    f.handlers().onConfigurePart({ assetId: "x", label: "Renombrado" }),
  );
  assert.equal(f.current().accessoryId, "z");
  assert.match(f.container.textContent, /no se permiten ciclos/);
  await f.back();
  assert.equal(f.current().assetId, "x");
});
test("going back protects unsaved changes and is blocked during persistence", async () => {
  const f = await fixture();
  await act(() =>
    f.handlers().onConfigurePart({ accessoryId: "y", label: "Implemento Y" }),
  );
  await act(() => f.handlers().onDirtyChange(true));
  window.confirm = () => false;
  await f.back();
  assert.equal(f.current().accessoryId, "y");
  window.confirm = () => true;
  await act(() => f.handlers().onBusyChange(true));
  await f.back();
  assert.equal(f.current().accessoryId, "y");
  await act(() => f.handlers().onBusyChange(false));
  await f.back();
  assert.equal(f.current().assetId, "x");
});
