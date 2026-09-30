import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
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
const profile = {
  id: "profile",
  scopeType: "ASSET",
  scopeId: "asset",
  version: 1,
  effectiveFrom: "2026-09-30",
  groups: [],
  modes: [
    {
      id: "mode",
      name: "Alquiler",
      unit: "DAY",
      minimum: { value: "3", basis: "PER_RENTAL" },
      pricing: { source: "FIXED", amount: "2000" },
      conditions: [],
      parts: [],
    },
  ],
};

async function fixture({ failLoad = false, failSave = false } = {}) {
  const calls = [],
    controls = {},
    dirties = [];
  let rejectSave = failSave;
  const box = ({ children }) => React.createElement("div", {}, children);
  const Panel = loadTransportModule(
    "../commercial-profiles/CommercialProfilePanel.tsx",
    {
      "@mantine/core": {
        Alert: box,
        Badge: box,
        Group: box,
        Loader: box,
        SimpleGrid: box,
        Stack: box,
        Text: box,
        Select: (props) => {
          controls.scope = props;
          return null;
        },
        Button: ({ children, onClick, disabled }) =>
          React.createElement("button", { onClick, disabled }, children),
      },
      "./CommercialProfileEditor": (props) => {
        controls.editor = props;
        return React.createElement(
          "p",
          {},
          props.value.modes.map((mode) => mode.name).join(","),
        );
      },
      "@/lib/api": {
        api: async (path, options = {}) => {
          calls.push({
            path,
            method: options.method ?? "GET",
            json: options.json,
          });
          if (options.method === "PUT") {
            if (rejectSave)
              throw Error("Conflicto: recarga o reintenta sin duplicar equipo");
            return { ...profile, ...options.json, version: 2 };
          }
          if (path.startsWith("/commercial-profiles")) {
            if (failLoad) throw Error("No se pudo leer el perfil");
            return structuredClone(profile);
          }
          if (path.startsWith("/equipment-configurations"))
            return { version: 1, entries: [], parent: { familyId: "family" } };
          return { skuId: "sku" };
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
      React.createElement(Panel, {
        assetId: "asset",
        onDirtyChange: (dirty) => dirties.push(dirty),
      }),
    ),
  );
  return {
    calls,
    controls,
    container,
    dirties,
    allowSave: () => {
      rejectSave = false;
    },
    click: (label) =>
      act(async () =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === label)
          .click(),
      ),
    edit: () =>
      act(() =>
        controls.editor.onChange({
          ...controls.editor.value,
          modes: [{ ...profile.modes[0], name: "Servicio actualizado" }],
        }),
      ),
  };
}

test("load errors never become an empty version-zero editable profile", async () => {
  const f = await fixture({ failLoad: true });
  assert.match(f.container.textContent, /No se pudo leer el perfil/);
  assert.equal(f.controls.editor, undefined);
  assert.equal(
    f.calls.some((call) => call.method !== "GET"),
    false,
  );
});
test("failed commercial save retains the draft and retries only the same profile, never equipment creation", async () => {
  const f = await fixture({ failSave: true });
  await f.edit();
  await f.click("Guardar modalidades");
  assert.match(f.container.textContent, /Conflicto/);
  assert.equal(f.controls.editor.value.modes[0].name, "Servicio actualizado");
  assert.equal(f.dirties.at(-1), true);
  f.allowSave();
  await f.click("Guardar modalidades");
  assert.equal(f.dirties.at(-1), false);
  const writes = f.calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 2);
  assert.ok(
    writes.every(
      (call) =>
        call.path === "/commercial-profiles" &&
        call.method === "PUT" &&
        call.json.scopeId === "asset" &&
        call.json.expectedVersion === 1,
    ),
  );
  assert.match(f.container.textContent, /Modalidades guardadas/);
});
test("initial form and navigation cannot resurrect the removed family-components API", () => {
  const form = readFileSync(
    new URL(
      "../serialized-assets/CreateSerializedAssetForm.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const legacyPage = readFileSync(
    new URL("../../app/settings/asset-components/page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(form.includes("/asset-families/components"), false);
  assert.equal(legacyPage.includes("/asset-families/components"), false);
  assert.match(legacyPage, /redirect\('\/inventory\/warehouse'\)/);
});
