import { getSerialDisplayName } from '@/lib/serial-assets';

export type PartRole = "COMPONENT" | "ACCESSORY";
export type ConfigurationLocation =
  | { assetId: string; accessoryId?: never; skuId?: never; label: string }
  | { accessoryId: string; assetId?: never; skuId?: never; label: string }
  | { skuId: string; assetId?: never; accessoryId?: never; label: string };
export type ConfigurationEntry = {
  id: string;
  role: PartRole;
  assetId?: string | null;
  skuId?: string | null;
  recommendation?: boolean;
  sku?: { id: string; name: string; imageUrl?: string | null; isConsumable?: boolean } | null;
  accessoryId?: string | null;
  familyId?: string | null;
  templateParentFamilyId?: string | null;
  family?: { id: string; name: string; controlType: 'SERIAL' | 'BULK' } | null;
  maximumQuantity?: number | null;
  quantity: number;
  defaultIncluded: boolean;
  required: boolean;
  newPart?: {
    name: string;
    kind: "INDIVIDUAL" | "RETURNABLE" | "CONSUMABLE";
    initialQuantity: number;
    exclusive: boolean;
    compatibility?: "PARENT" | "SUBFAMILY" | "FAMILY";
  };
  asset?: { id: string; publicCode: string; description?: string | null;
    internalNumber?: number | null; warehouseOwner?: { name: string } | null;
    imageUrl?: string | null; isImplement?: boolean; sku: { name: string; imageUrl?: string | null } } | null;
  accessory?: {
    id: string;
    name: string;
    internalCode: string | null;
    kind: string;
    purpose: PartRole;
    exclusiveAssetId: string | null;
  } | null;
};
export type EquipmentConfiguration = {
  deliveryFuelSelectable?: boolean;
  notes?: string | null;
  version: number;
  entries: ConfigurationEntry[];
  parent?: { name: string; familyId: string; ownerWarehouseId?: string | null; warehouseId: string | null; isImplement?: boolean };
};
export const partRoleLabels: Record<PartRole, string> = {
  COMPONENT: "Implemento",
  ACCESSORY: "Implemento",
};
export const entryName = (entry: ConfigurationEntry) =>
  entry.newPart?.name ||
  entry.accessory?.name ||
  entry.sku?.name ||
  (entry.asset ? `${getSerialDisplayName({ ...entry.asset, skuName: entry.asset.sku.name })}${entry.asset.warehouseOwner?.name ? ` · ${entry.asset.warehouseOwner.name}` : ''}` : '') ||
  entry.family?.name ||
  "Sin nombre";

export function configurationPartLocation(entry: ConfigurationEntry): ConfigurationLocation | null {
  if (entry.assetId) return { assetId: entry.assetId, label: entryName(entry) };
  if (entry.skuId) return { skuId: entry.skuId, label: entryName(entry) };
  if (entry.accessoryId) return { accessoryId: entry.accessoryId, label: entryName(entry) };
  return null; // New elements must be saved to obtain their persistent identity.
}

export function configurationPartAction(entry: ConfigurationEntry) {
  if (entry.familyId) return null; // A family is a selector, not a physical parent.
  const hasParts = !!entry.assetId || (entry.role === "ACCESSORY" &&
    (entry.newPart?.kind ?? entry.accessory?.kind) === "INDIVIDUAL");
  return hasParts ? "Conjunto y cobro" : "Cobro";
}

// Strip presentation and Prisma fields. The payload never includes stock movements.
export function configurationPayload(config: EquipmentConfiguration) {
  return {
    version: config.version,
    ...(config.notes !== undefined ? { notes: config.notes } : {}),
    entries: config.entries.map((row) => ({
      id: row.id,
      role: row.role,
      recommendation: row.recommendation ?? !!row.familyId,
      ...(row.assetId ? { assetId: row.assetId } : {}),
      ...(row.skuId ? { skuId: row.skuId } : {}),
      ...(row.accessoryId ? { accessoryId: row.accessoryId } : {}),
      ...(row.familyId ? { familyId: row.familyId } : {}),
      ...(row.familyId && row.templateParentFamilyId !== undefined ? { templateParentFamilyId: row.templateParentFamilyId } : {}),
      ...(row.maximumQuantity !== undefined ? { maximumQuantity: row.maximumQuantity } : {}),
      ...(row.newPart ? { newPart: row.newPart } : {}),
      quantity: row.quantity,
      defaultIncluded: row.defaultIncluded,
      required: row.required,
    })),
  };
}
export function configurationError(config: EquipmentConfiguration) {
  for (const row of config.entries) {
    if (![row.assetId, row.skuId, row.accessoryId, row.familyId, row.newPart].filter(Boolean).length)
      return "Vincula un elemento o completa sus datos.";
    if (row.newPart && !row.newPart.name.trim())
      return "Escribe el nombre de cada elemento nuevo.";
    if (!Number.isInteger(row.quantity) || row.quantity < 1)
      return "Las cantidades deben ser enteros positivos.";
    if (
      row.newPart &&
      (!Number.isInteger(row.newPart.initialQuantity) ||
        row.newPart.initialQuantity < 1)
    )
      return "Indica una existencia inicial positiva.";
  }
  const families = new Map(config.entries.filter(row => row.familyId).map(row => [row.familyId!, row]));
  for (const row of config.entries) {
    if (row.templateParentFamilyId && !row.familyId)
      return "Solo una familia de la ruta puede tener un paso anterior.";
    if (row.templateParentFamilyId && !families.has(row.templateParentFamilyId))
      return "El paso anterior debe pertenecer a esta ruta.";
    const visited = new Set<string>();
    let current: ConfigurationEntry | undefined = row.familyId ? row : undefined;
    while (current?.familyId) {
      if (visited.has(current.familyId)) return "La ruta no puede tener ciclos.";
      visited.add(current.familyId);
      if (visited.size > 16) return "La ruta admite hasta 16 niveles.";
      current = current.templateParentFamilyId ? families.get(current.templateParentFamilyId) : undefined;
    }
  }
  return null;
}
