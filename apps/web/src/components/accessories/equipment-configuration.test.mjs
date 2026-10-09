import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadTransportModule } from "../transport/test-support.cjs";

const { MantineProvider } = createRequire(import.meta.url)("@mantine/core");
const { configurationPayload, configurationError, configurationPartAction, configurationPartLocation, entryName } = loadTransportModule(
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
  assert.equal(configurationPartAction(individual), 'Conjunto y cobro');
  assert.deepEqual(configurationPartLocation(individual), { accessoryId: 'any-y', label: 'Implemento Y' });
  assert.equal(configurationPartAction({ ...individual, accessory: { ...individual.accessory, kind: 'CONSUMABLE' } }), 'Cobro');
  assert.equal(configurationPartAction({ ...individual, accessory: { ...individual.accessory, kind: 'RETURNABLE' } }), 'Cobro');
  assert.equal(configurationPartAction(row), 'Cobro');
  assert.equal(configurationPartAction({ id: 'selector', familyId: 'any-family' }), null);
  assert.equal(configurationPartLocation({ id: 'new', newPart: { name: 'Implemento Z' } }), null);
  assert.equal(configurationPartAction({ id: 'new', role: 'ACCESSORY', newPart: { kind: 'INDIVIDUAL' } }), 'Conjunto y cobro');
  assert.equal(configurationPartAction({ id: 'new', role: 'ACCESSORY', newPart: { kind: 'CONSUMABLE' } }), 'Cobro');
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
        recommendation: false,
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
  assert.deepEqual(configurationPayload(config).entries, [{ ...entry, recommendation: false }]);
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
test("renders compatible implements without the archived route or technical controls", () => {
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
    "Implementos compatibles",
    "TECHO DD-29",
    "Agregar",
  ])
    assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /Notas de configuración|<summary[^>]*>Notas/);
  assert.doesNotMatch(markup, /Agregar implemento|Agregar componente|AGREGAR IMPLEMENTO EXISTENTE/);
  assert.equal((markup.match(/>Agregar<\/span>/g) ?? []).length, 1);
  assert.equal(configurationPayload({ version: 1, entries: [row], notes: "Nota guardada" }).notes, "Nota guardada");
  assert.doesNotMatch(markup, /Cada relación vincula/);
  assert.doesNotMatch(markup, /Cantidad habitual|Cantidad máxima|Requerido para operar|Elegir unidad en la remisión/);
  assert.doesNotMatch(markup, /Plantilla recomendada|Ruta recomendada|Agregar a la ruta|Agregar familia a la ruta/);
});

test('part titles and breadcrumbs distinguish units and owners without exposing import codes', () => {
  const asset = { id: 'asset-id', publicCode: 'MINICARGADOR-ESTANDAR-5353-0003',
    internalNumber: 3, description: 'New Holland', sku: { name: 'MINICARGADOR' }, warehouseOwner: { name: 'Motavita' } };
  const entry = { ...row, accessoryId: undefined, accessory: undefined, assetId: asset.id, asset };
  assert.equal(entryName(entry), 'New Holland #3 · Motavita');
  assert.deepEqual(configurationPartLocation(entry), { assetId: 'asset-id', label: entryName(entry) });
  assert.equal(entryName({ ...entry, asset: { ...asset, internalNumber: 2 } }), 'New Holland #2 · Motavita');
  const markup = renderToStaticMarkup(React.createElement(MantineProvider, {}, React.createElement(Editor, {
    value: { version: 1, entries: [entry, { ...row, id: 'bucket', accessory: { ...row.accessory, internalCode: 'ACC-CODE-LARGO' } }] }, onChange() {},
  })));
  assert.match(markup, /New Holland #3/);
  assert.doesNotMatch(markup, /MINICARGADOR-ESTANDAR-5353-0003|ACC-CODE-LARGO/);
  assert.equal(configurationPayload({ version: 1, entries: [entry] }).entries[0].assetId, asset.id);
});
