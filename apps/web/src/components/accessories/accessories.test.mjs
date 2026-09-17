import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadTransportModule } from "../transport/test-support.cjs";

const { MantineProvider } = createRequire(import.meta.url)("@mantine/core");

const {
  compatibleWith,
  balanceLabel,
  includeEquipmentCompatibility,
  allowsManualMovement,
} = loadTransportModule("../accessories/types.ts");
const AccessoryCard = loadTransportModule(
  "../accessories/AccessoryCard.tsx",
).default;
const equipment = {
  id: "pluma-1",
  publicCode: "PL-001",
  sku: {
    name: "PLUMA 200 KG",
    assetFamilyId: "pluma",
    assetSubfamilyId: "200",
  },
};
const item = {
  id: "canasta",
  name: "CANASTA",
  kind: "INDIVIDUAL",
  internalCode: "CAN-001",
  familyId: "pluma",
  family: { name: "PLUMA" },
  scope: "FAMILY",
  ownerWarehouse: { name: "BODEGA" },
  subfamilies: [],
  assets: [],
  active: true,
  balances: [],
};
const noop = () => {};
const render = (value) =>
  renderToStaticMarkup(
    React.createElement(
      MantineProvider,
      {},
      React.createElement(AccessoryCard, {
        item: value,
        equipmentId: equipment.id,
        onEdit: noop,
        onMove: noop,
        onHistory: noop,
      }),
    ),
  );

test("compatibility respects family, subfamily and explicit equipment scopes", () => {
  assert.equal(compatibleWith(item, equipment), true);
  assert.equal(
    compatibleWith({ ...item, familyId: "retro" }, equipment),
    false,
  );
  assert.equal(
    compatibleWith(
      { ...item, scope: "SUBFAMILIES", subfamilies: [{ subfamilyId: "200" }] },
      equipment,
    ),
    true,
  );
  assert.equal(
    compatibleWith(
      { ...item, scope: "SUBFAMILIES", subfamilies: [{ subfamilyId: "300" }] },
      equipment,
    ),
    false,
  );
  assert.equal(
    compatibleWith(
      { ...item, scope: "ASSETS", assets: [{ assetId: "pluma-1" }] },
      equipment,
    ),
    true,
  );
  assert.equal(
    compatibleWith(
      { ...item, scope: "ASSETS", assets: [{ assetId: "pluma-2" }] },
      equipment,
    ),
    false,
  );
});

test("equipment card distinguishes compatibility from current assignment", () => {
  assert.match(render(item), /sin asignación a este equipo/);
  const assigned = {
    ...item,
    balances: [
      { id: "balance", assetId: equipment.id, asset: equipment, quantity: 1 },
    ],
  };
  assert.match(render(assigned), /1 asignado\(s\) a este equipo/);
  assert.match(render(assigned), /CAN-001/);
  assert.equal(balanceLabel(assigned.balances[0]), "PLUMA 200 KG · PL-001");
});

test("consumable card displays quantities without a per-unit identity", () => {
  const markup = render({
    ...item,
    kind: "CONSUMABLE",
    internalCode: null,
    balances: [{ id: "balance", warehouse: { name: "BODEGA" }, quantity: 4 }],
  });
  assert.match(markup, /Consumible/);
  assert.match(markup, /Existencias: 4/);
  assert.doesNotMatch(markup, /Código:/);
});

test("returnable hoses display quantity and allow replenishment but not consumption", () => {
  const markup = render({
    ...item,
    name: "MANGUERAS",
    kind: "RETURNABLE",
    internalCode: null,
    balances: [{ id: "balance", warehouse: { name: "BODEGA" }, quantity: 6 }],
  });
  assert.match(markup, /Retornable por cantidad/);
  assert.match(markup, /Existencias: 6/);
  assert.doesNotMatch(markup, /Consumible|Código:/);
  assert.equal(allowsManualMovement("RETURNABLE", "RECEIVE"), true);
  assert.equal(allowsManualMovement("RETURNABLE", "RETURN"), true);
  assert.equal(allowsManualMovement("RETURNABLE", "CONSUME"), false);
  assert.equal(allowsManualMovement("RETURNABLE", "TRANSIT"), false);
  assert.equal(allowsManualMovement("CONSUMABLE", "CONSUME"), true);
  assert.equal(allowsManualMovement("INDIVIDUAL", "RECEIVE"), false);
});

test("cards always expose editing and history; archived stock cannot be moved", () => {
  const markup = render({ ...item, active: false });
  assert.match(markup, /Editar accesorio/);
  assert.match(markup, /Historial/);
  assert.match(markup, /Archivado/);
  assert.match(markup, /disabled[^>]*>[\s\S]*?Registrar movimiento/);
});

test("linking an existing accessory preserves other equipment and subfamilies", () => {
  const explicit = { ...item, scope: "ASSETS", assets: [{ assetId: "other" }] };
  const linked = includeEquipmentCompatibility(explicit, equipment);
  assert.deepEqual(
    linked.assets.map((a) => a.assetId),
    ["other", "pluma-1"],
  );
  assert.equal(includeEquipmentCompatibility(linked, equipment), linked);
  const bySubfamily = includeEquipmentCompatibility(
    { ...item, scope: "SUBFAMILIES", subfamilies: [{ subfamilyId: "300" }] },
    equipment,
  );
  assert.deepEqual(
    bySubfamily.subfamilies.map((s) => s.subfamilyId),
    ["300", "200"],
  );
  assert.equal(includeEquipmentCompatibility(item, equipment), item);
  assert.throws(() =>
    includeEquipmentCompatibility({ ...item, familyId: "retro" }, equipment),
  );
});
