import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadTransportModule } from "../transport/test-support.cjs";

const { MantineProvider } = createRequire(import.meta.url)("@mantine/core");
const { configurationPayload, configurationError, configurationPartAction, configurationPartLocation } = loadTransportModule(
  "../equipment-configuration/types.ts",
);
const Editor = loadTransportModule(
  "../equipment-configuration/ConfigurationEditor.tsx",
).default;
const row = {
  id: "row",
  role: "COMPONENT",
  accessoryId: "roof",
  quantity: 1,
  required: false,
  defaultIncluded: true,
  accessory: {
    id: "roof",
    name: "TECHO DD-29",
    kind: "INDIVIDUAL",
    exclusiveAssetId: "roller",
  },
};

test('nested configuration uses persistent identities and allows children only on individual implements', () => {
  const individual = { ...row, role: 'ACCESSORY', accessoryId: 'any-y', accessory: { ...row.accessory, name: 'Implemento Y' } };
  assert.equal(configurationPartAction(individual), 'Configurar conjunto y cobro');
  assert.deepEqual(configurationPartLocation(individual), { accessoryId: 'any-y', label: 'Implemento Y' });
  assert.equal(configurationPartAction({ ...individual, accessory: { ...individual.accessory, kind: 'CONSUMABLE' } }), 'Configurar cobro');
  assert.equal(configurationPartAction({ ...individual, accessory: { ...individual.accessory, kind: 'RETURNABLE' } }), 'Configurar cobro');
  assert.equal(configurationPartAction(row), 'Configurar cobro');
  assert.equal(configurationPartAction({ id: 'selector', familyId: 'any-family' }), null);
  assert.equal(configurationPartLocation({ id: 'new', newPart: { name: 'Implemento Z' } }), null);
  assert.equal(configurationPartAction({ id: 'new', role: 'ACCESSORY', newPart: { kind: 'INDIVIDUAL' } }), 'Configurar conjunto y cobro');
  assert.equal(configurationPartAction({ id: 'new', role: 'ACCESSORY', newPart: { kind: 'CONSUMABLE' } }), 'Configurar cobro');
  assert.deepEqual(configurationPartLocation({ assetId: 'any-x', asset: { sku: { name: 'Equipo X' } } }), { assetId: 'any-x', label: 'Equipo X' });
});

test("configuration payload strips display and server fields without creating stock or deliveries", () => {
  const payload = configurationPayload({
    version: 4,
    entries: [{ ...row, configurationId: "server", balances: [123] }],
  });
  assert.deepEqual(payload, {
    version: 4,
    entries: [
      {
        id: "row",
        role: "COMPONENT",
        accessoryId: "roof",
        quantity: 1,
        required: false,
        defaultIncluded: true,
      },
    ],
  });
});
test("a new part retains opening stock independently of the habitual quantity", () => {
  const entry = {
    id: "tips",
    role: "ACCESSORY",
    quantity: 2,
    required: false,
    defaultIncluded: false,
    newPart: {
      name: "PUNTAS",
      kind: "CONSUMABLE",
      initialQuantity: 10,
      exclusive: false,
      compatibility: "PARENT",
    },
  };
  const config = { version: 0, entries: [entry] };
  assert.equal(configurationError(config), null);
  assert.deepEqual(configurationPayload(config).entries, [entry]);
  assert.match(
    configurationError({ ...config, entries: [{ ...entry, quantity: 0 }] }),
    /enteros positivos/,
  );
});
test('component configuration cannot overwrite the assignment managed by the motor modal', () => {
  const payload = configurationPayload({ version: 2, entries: [], motor: { configuration: 'INTERCHANGEABLE',
    assignedMotorId: 'motor-8', assignedMotor: { sku: { name: 'Display only' } }, canConfigure: true } });
  assert.equal('motor' in payload, false);
  assert.deepEqual(payload.entries, []);
});
test("renders separate classifications, independent flags and configuration notes", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MantineProvider,
      {},
      React.createElement(Editor, {
        value: { version: 1, entries: [row] },
        onChange() {},
      }),
    ),
  );
  for (const text of [
    "Componentes del equipo",
    "Accesorios de trabajo",
    "Incluido por defecto",
    "Requerido para operar",
    "TECHO DD-29",
    "no elimina el elemento",
    "Notas de configuración",
  ])
    assert.ok(markup.includes(text), text);
});
