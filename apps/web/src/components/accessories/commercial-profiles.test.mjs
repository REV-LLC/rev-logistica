import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadTransportModule } from "../transport/test-support.cjs";

const { MantineProvider } = createRequire(import.meta.url)("@mantine/core");
const {
  commercialPayload,
  commercialError,
  configuredSelectorOptions,
  newCommercialMode,
  commercialScopeIds,
  parseSelectorKey,
} = loadTransportModule("../commercial-profiles/types.ts");
const Editor = loadTransportModule(
  "../commercial-profiles/CommercialProfileEditor.tsx",
).default;
const group = {
  id: "group-1",
  name: "Implementos",
  selectors: [{ kind: "FAMILY", id: "family-1" }],
};
const mode = {
  ...newCommercialMode("mode-1"),
  name: "Servicio",
  unit: "HOUR",
  minimum: { value: "6", basis: "PER_REPORTED_DAY" },
  pricing: { source: "FIXED", amount: "80000" },
  parts: [{ groupId: group.id, treatment: "INCLUDED" }],
};
const profile = {
  id: "profile-1",
  scopeType: "ASSET",
  scopeId: "asset-1",
  version: 2,
  effectiveFrom: "2026-09-30",
  groups: [group],
  modes: [mode],
};

test('implement pricing exposes only its asset/reference scopes, never its equipment family', () => {
  const ids = { ASSET: 'implement-asset', SKU: 'implement-sku', FAMILY: 'shared-family' };
  assert.deepEqual(commercialScopeIds(ids, true), { ASSET: ids.ASSET, SKU: ids.SKU });
  assert.deepEqual(commercialScopeIds(ids, false), ids);
  assert.deepEqual(commercialScopeIds({ SKU: 'bulk', FAMILY: 'bulk-family' }, true), { SKU: 'bulk' });
  assert.equal(ids.FAMILY, 'shared-family');
});

test("commercial payload preserves stable IDs and concurrency version without stock or physical configuration", () => {
  const payload = commercialPayload({
    ...profile,
    inherited: profile,
    displayName: "Display",
    configuration: { version: 7 },
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    "expectedVersion",
    "groups",
    "modes",
    "scopeId",
    "scopeType",
  ]);
  assert.equal(payload.expectedVersion, 2);
  assert.equal(payload.groups[0].id, group.id);
  assert.deepEqual(payload.groups[0].selectors, [
    { kind: "FAMILY", id: "family-1" },
  ]);
  assert.equal(payload.modes[0].id, mode.id);
  assert.equal(payload.modes[0].parts[0].treatment, "INCLUDED");
  assert.equal(commercialError(profile), null);
});

test("missing rate is not silently zero; explicit zero and matching catalog source are valid inputs", () => {
  assert.match(
    commercialError({
      ...profile,
      modes: [{ ...mode, pricing: { source: "FIXED", amount: "" } }],
    }),
    /tarifa válida/,
  );
  for (const pricing of [
    { source: "FIXED", amount: "0" },
    { source: "CATALOG" },
  ]) {
    assert.equal(
      commercialError({ ...profile, modes: [{ ...mode, pricing }] }),
      null,
    );
  }
  assert.equal(newCommercialMode("new").pricing.amount, "");
});

test("day and meter alternatives are configured by group IDs, independent of equipment names", () => {
  const modes = [
    {
      ...mode,
      id: "without",
      name: "Alquiler básico",
      unit: "DAY",
      minimum: { value: "3", basis: "PER_RENTAL" },
      conditions: [
        { groupId: group.id, presence: "ABSENT", minimumQuantity: 9 },
      ],
    },
    {
      ...mode,
      id: "with",
      name: "Servicio especializado",
      unit: "METER",
      minimum: { value: "40", basis: "PER_RENTAL" },
      conditions: [{ groupId: group.id, presence: "PRESENT" }],
    },
  ];
  const draft = { ...profile, modes };
  assert.equal(commercialError(draft), null);
  const payload = commercialPayload(draft);
  assert.deepEqual(payload.modes[0].conditions, [
    { groupId: group.id, presence: "ABSENT" },
  ]);
  assert.equal(payload.modes[1].conditions[0].minimumQuantity, 1);
  assert.equal(
    commercialError({
      ...draft,
      modes: [{ ...modes[0], conditions: [] }, modes[1]],
    }).includes("coincidiría siempre"),
    true,
  );
});

test("minimum units and incomplete references are validated before saving", () => {
  for (const minimum of [
    { value: "-1", basis: "PER_REPORTED_DAY" },
    { value: "6", basis: "PER_RENTAL" },
  ]) {
    assert.ok(commercialError({ ...profile, modes: [{ ...mode, minimum }] }));
  }
  assert.ok(
    commercialError({
      ...profile,
      modes: [
        {
          ...mode,
          unit: "DAY",
          minimum: { value: "1.5", basis: "PER_RENTAL" },
        },
      ],
    }),
  );
  assert.ok(
    commercialError({
      ...profile,
      modes: [
        { ...mode, conditions: [{ groupId: "missing", presence: "PRESENT" }] },
      ],
    }),
  );
  assert.ok(
    commercialError({ ...profile, groups: [{ ...group, selectors: [] }] }),
  );
});

test("selectors derive from saved part identity, not entry IDs, names or defaultIncluded", () => {
  const entries = [
    {
      id: "unstable-row",
      familyId: "family-1",
      family: { name: "Herramientas" },
      defaultIncluded: false,
    },
    {
      id: "row-2",
      accessoryId: "part-2",
      accessory: { name: "Manguera" },
      defaultIncluded: true,
    },
    { id: "unsaved-row", newPart: { name: "Disco", kind: "CONSUMABLE" } },
  ];
  const options = configuredSelectorOptions(entries, []);
  assert.deepEqual(
    options.map((option) => option.value),
    ["FAMILY:family-1", "ACCESSORY:part-2"],
  );
  assert.deepEqual(parseSelectorKey(options[0].value), {
    kind: "FAMILY",
    id: "family-1",
  });
  assert.throws(() => parseSelectorKey("NAME:Herramientas"));
  assert.equal(
    configuredSelectorOptions([], [group])[0].value,
    "FAMILY:family-1",
  );
});

test("editor renders Spanish generic pricing without a manual effective date or help block", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MantineProvider,
      {},
      React.createElement(Editor, {
        value: profile,
        entries: [],
        onChange() {},
      }),
    ),
  );
  for (const label of [
    "Grupos de implementos",
    "Otras combinaciones",
    "Cuándo aplica",
    "La tarifa $0",
    "Crear alternativas con / sin",
    "Cantidad mínima a cobrar",
    "Precio c/u",
    "Cálculo automático",
  ])
    assert.ok(markup.includes(label), label);
  assert.equal(markup.includes("Cortadora"), false);
  assert.doesNotMatch(markup, /Ayuda de cobros/);
  assert.doesNotMatch(markup, /Opciones avanzadas|Unidad de cobro|Reemplaza las modalidades/);
  assert.doesNotMatch(markup, /Vigente desde|type="date"/);
  assert.doesNotMatch(markup, /Composición y cobro son decisiones distintas/);
  assert.doesNotMatch(markup, /referencia guardada family-1/);
});

test('save omits old, missing or future effective dates; the server dates every new revision', () => {
  for (const effectiveFrom of [null, '2026-09-30', '2099-01-01']) {
    const value = { ...profile, effectiveFrom };
    assert.equal(commercialError(value), null);
    assert.equal(Object.hasOwn(commercialPayload(value), 'effectiveFrom'), false);
  }
});

test('selectors show unit names or an explicit outside-set status while preserving stored identities', () => {
  const options = configuredSelectorOptions([{ assetId: 'asset-1', asset: { publicCode: 'LONG-IMPORT-CODE',
    description: 'Compresor Atlas', internalNumber: 1, sku: { name: 'Compresor' } } }], [{
    name: 'Martillos', selectors: [{ kind: 'ASSET', id: 'old-unit-uuid' }, { kind: 'ASSET', id: 'other-unit-uuid' }],
  }]);
  assert.deepEqual(options, [
    { value: 'ASSET:asset-1', label: 'Compresor Atlas #1' },
    { value: 'ASSET:old-unit-uuid', label: 'Martillos · elemento fuera del conjunto (1)' },
    { value: 'ASSET:other-unit-uuid', label: 'Martillos · elemento fuera del conjunto (2)' },
  ]);
});
