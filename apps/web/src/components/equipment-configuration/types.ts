export type PartRole = "COMPONENT" | "ACCESSORY";
export type ConfigurationLocation =
  | { assetId: string; accessoryId?: never; label: string }
  | { accessoryId: string; assetId?: never; label: string };
export type ConfigurationEntry = {
  id: string;
  role: PartRole;
  assetId?: string | null;
  accessoryId?: string | null;
  familyId?: string | null;
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
  asset?: { id: string; publicCode: string; sku: { name: string } } | null;
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
  motor?: EquipmentMotor;
  notes?: string | null;
  version: number;
  entries: ConfigurationEntry[];
  parent?: { name: string; familyId: string; warehouseId: string | null };
};
export type MotorAsset = { description?: string | null; id: string; publicCode: string; internalNumber: number; serialOrEngine: string | null; fuel: string | null; sku: { name: string } };
export type EquipmentMotor = {
  configuration: 'NONE' | 'FIXED' | 'INTERCHANGEABLE';
  assignedMotorId?: string | null;
  assignedMotor?: MotorAsset | null;
  canConfigure?: boolean;
};
export const motorLabel = (motor: MotorAsset) => `${motor.description || motor.sku.name} #${motor.internalNumber}${motor.serialOrEngine ? ` · ${motor.serialOrEngine}` : ''}`;
export const partRoleLabels: Record<PartRole, string> = {
  COMPONENT: "Componente",
  ACCESSORY: "Accesorio",
};
export const entryName = (entry: ConfigurationEntry) =>
  entry.newPart?.name ||
  entry.accessory?.name ||
  entry.asset?.sku.name ||
  entry.family?.name ||
  "Sin nombre";

export function configurationPartLocation(entry: ConfigurationEntry): ConfigurationLocation | null {
  if (entry.assetId) return { assetId: entry.assetId, label: entryName(entry) };
  if (entry.accessoryId) return { accessoryId: entry.accessoryId, label: entryName(entry) };
  return null; // New elements must be saved to obtain their persistent identity.
}

export function configurationPartAction(entry: ConfigurationEntry) {
  if (entry.familyId) return null; // A family is a selector, not a physical parent.
  const hasParts = !!entry.assetId || (entry.role === "ACCESSORY" &&
    (entry.newPart?.kind ?? entry.accessory?.kind) === "INDIVIDUAL");
  return hasParts ? "Configurar conjunto y cobro" : "Configurar cobro";
}

// Strip presentation and Prisma fields. The payload never includes stock movements.
export function configurationPayload(config: EquipmentConfiguration) {
  return {
    version: config.version,
    ...(config.notes !== undefined ? { notes: config.notes } : {}),
    entries: config.entries.map((row) => ({
      id: row.id,
      role: row.role,
      ...(row.assetId ? { assetId: row.assetId } : {}),
      ...(row.accessoryId ? { accessoryId: row.accessoryId } : {}),
      ...(row.familyId ? { familyId: row.familyId } : {}),
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
    if (![row.assetId, row.accessoryId, row.familyId, row.newPart].filter(Boolean).length)
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
  return null;
}
