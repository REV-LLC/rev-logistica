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
  parseSelectorKey,
  todayInBogota,
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

test("commercial payload preserves stable IDs and concurrency version without stock or physical configuration", () => {
  const payload = commercialPayload({
    ...profile,
    inherited: profile,
    displayName: "Display",
    configuration: { version: 7 },
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    "effectiveFrom",
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
  assert.match(todayInBogota(), /^\d{4}-\d{2}-\d{2}$/);
});

test("editor renders Spanish generic configuration, units, inclusion and effective date", () => {
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
    "Modalidades de cobro",
    "Vigente desde",
    "Cuándo aplica",
    "Incluido",
    "Crear alternativas con / sin",
    "Mínimo de horas",
  ])
    assert.ok(markup.includes(label), label);
  assert.equal(markup.includes("Cortadora"), false);
});
