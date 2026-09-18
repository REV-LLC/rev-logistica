import { getAssetDisplayLabel } from '@/lib/serial-assets';

export type AccessoryKind = "INDIVIDUAL" | "RETURNABLE" | "CONSUMABLE";
export type AccessoryScope = "FAMILY" | "SUBFAMILIES" | "ASSETS";
export type MovementType =
  | "RECEIVE"
  | "ASSIGN"
  | "RETURN"
  | "TRANSFER"
  | "CONSUME"
  | "RETIRE"
  | "TRANSIT"
  | "PROVIDER_RECEIVE";
export type Equipment = {
  id: string;
  publicCode: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  internalNumber?: number | null;
  warehouseOwnerId: string;
  warehouseCurrentId: string | null;
  sku: {
    name: string;
    assetFamilyId: string;
    assetSubfamilyId: string | null;
    assetFamily?: { name: string } | null;
    assetSubfamily?: { name: string } | null;
  };
};
export type Family = {
  id: string;
  name: string;
  subfamilies: Array<{ id: string; name: string }>;
};
export type Warehouse = { id: string; name: string; active?: boolean };
export type Location = {
  warehouseId?: string;
  assetId?: string;
  customerWorksiteId?: string;
  label?: string;
};
export type Accessory = {
  id: string;
  name: string;
  description: string | null;
  kind: AccessoryKind;
  internalCode: string | null;
  familyId: string;
  family: { id: string; name: string };
  scope: AccessoryScope;
  ownerWarehouseId: string;
  ownerWarehouse: Warehouse;
  version: number;
  active: boolean;
  subfamilies: Array<{ subfamilyId: string; subfamily: { name: string } }>;
  assets: Array<{ assetId: string; asset: Equipment }>;
  balances: Array<{
    id: string;
    locationKey: string;
    warehouseId: string | null;
    assetId: string | null;
    customerWorksiteId?: string | null;
    transitDocumentId?: string | null;
    transitDocument?: { id: string; consecutive: string | null } | null;
    customerWorksite?: {
      worksite: { name: string };
      customer: { name: string };
    } | null;
    quantity: number;
    warehouse: Warehouse | null;
    asset: Equipment | null;
  }>;
};
export const kindLabels: Record<AccessoryKind, string> = {
  INDIVIDUAL: "Individualizado",
  RETURNABLE: "Retornable por cantidad",
  CONSUMABLE: "Consumible",
};
export const kindDescriptions: Record<AccessoryKind, string> = {
  INDIVIDUAL:
    "Tiene identidad propia, se devuelve y puede intercambiarse entre equipos compatibles.",
  RETURNABLE:
    "Se entrega y devuelve por unidades, incluso parcialmente. No tiene código por unidad ni se registra como consumo.",
  CONSUMABLE:
    "Se maneja por unidades. La entrega no descuenta consumo: registra lo utilizado y devuelve el sobrante.",
};
export function allowsManualMovement(kind: AccessoryKind, type: MovementType) {
  if (type === "TRANSIT" || type === "PROVIDER_RECEIVE") return false;
  if (type === "CONSUME") return kind === "CONSUMABLE";
  if (type === "RECEIVE") return kind !== "INDIVIDUAL";
  return true;
}
export const scopeLabels: Record<AccessoryScope, string> = {
  FAMILY: "Toda la familia",
  SUBFAMILIES: "Subfamilias seleccionadas",
  ASSETS: "Equipos específicos",
};
export const movementLabels: Record<MovementType, string> = {
  RECEIVE: "Ingreso",
  ASSIGN: "Entrega a equipo",
  RETURN: "Devolución a bodega",
  TRANSFER: "Traslado / intercambio",
  CONSUME: "Consumo",
  RETIRE: "Baja",
  TRANSIT: "En tránsito a proveedor",
  PROVIDER_RECEIVE: "Recepción de proveedor",
};
export const equipmentLabel = (asset: Equipment) =>
  getAssetDisplayLabel(asset);
export const balanceLabel = (balance: Accessory["balances"][number]) =>
  balance.transitDocumentId
    ? `En tránsito a proveedor · ${balance.transitDocument?.consecutive ?? "Devolución pendiente de recepción"}`
    : (balance.warehouse?.name ??
      (balance.asset
        ? `${equipmentLabel(balance.asset)}${balance.customerWorksite ? ` · Obra: ${balance.customerWorksite.worksite.name}` : ""}`
        : "Ubicación desconocida"));
export function compatibleWith(item: Accessory, equipment: Equipment) {
  return (
    item.familyId === equipment.sku.assetFamilyId &&
    (item.scope === "FAMILY" ||
      (item.scope === "SUBFAMILIES" &&
        item.subfamilies.some(
          (s) => s.subfamilyId === equipment.sku.assetSubfamilyId,
        )) ||
      (item.scope === "ASSETS" &&
        item.assets.some((a) => a.assetId === equipment.id)))
  );
}

export function includeEquipmentCompatibility(
  item: Accessory,
  equipment: Equipment,
): Accessory {
  if (item.familyId !== equipment.sku.assetFamilyId)
    throw new Error("El accesorio debe pertenecer a la familia del equipo.");
  if (compatibleWith(item, equipment)) return item;
  if (item.scope === "ASSETS")
    return {
      ...item,
      assets: [...item.assets, { assetId: equipment.id, asset: equipment }],
    };
  if (item.scope === "SUBFAMILIES" && equipment.sku.assetSubfamilyId)
    return {
      ...item,
      subfamilies: [
        ...item.subfamilies,
        {
          subfamilyId: equipment.sku.assetSubfamilyId,
          subfamily: { name: "Subfamilia del equipo seleccionado" },
        },
      ],
    };
  throw new Error(
    "El equipo necesita una subfamilia para ampliar este alcance.",
  );
}
