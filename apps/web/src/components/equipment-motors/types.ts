export type EquipmentIdentity = {
  id: string;
  publicCode: string;
  description?: string | null;
  internalNumber: number;
  imageUrl?: string | null;
  imageFileObject?: { storageKey: string } | null;
  sku: {
    name: string;
    imageUrl?: string | null;
    imageFileObject?: { storageKey: string } | null;
  };
  warehouseOwner?: { name: string };
};
export type MotorRecord = EquipmentIdentity & {
  brand: string | null;
  model: string | null;
  motorPowerHp: number | string | null;
  fuel: string | null;
  motorVersion: number;
  warehouseCurrentId: string | null;
  assignedToMixer: EquipmentIdentity | null;
  motorCompatibility: Array<{ equipment: EquipmentIdentity }>;
};
export type MotorForm = {
  brand: string;
  model: string;
  powerHp: number | string;
  fuel: "ELECTRICO" | "GASOLINA";
  compatibleEquipmentIds: string[];
};
export const equipmentLabel = (asset: EquipmentIdentity) =>
  `${asset.description || asset.sku.name} #${asset.internalNumber}${asset.warehouseOwner?.name ? ` · ${asset.warehouseOwner.name}` : ""}`;
export const equipmentName = (asset: EquipmentIdentity) =>
  `${asset.description || asset.sku.name} #${asset.internalNumber}`;
export const equipmentImage = (asset: EquipmentIdentity) =>
  asset.imageUrl?.trim() ||
  asset.imageFileObject?.storageKey?.trim() ||
  asset.sku.imageFileObject?.storageKey?.trim() ||
  asset.sku.imageUrl?.trim() ||
  null;
export const motorDescription = (value: MotorForm) =>
  [
    value.brand.trim(),
    value.powerHp ? `${value.powerHp} HP` : "",
    value.model.trim(),
  ]
    .filter(Boolean)
    .join(" ");
export const motorForm = (motor: MotorRecord): MotorForm => ({
  brand: motor.brand ?? "",
  model: motor.model ?? "",
  powerHp: motor.motorPowerHp == null ? "" : Number(motor.motorPowerHp),
  fuel: motor.fuel === "ELECTRICO" ? "ELECTRICO" : "GASOLINA",
  compatibleEquipmentIds: motor.motorCompatibility.map(
    (item) => item.equipment.id,
  ),
});
export const motorFormValid = (value: MotorForm) =>
  !!value.brand.trim() &&
  !!value.model.trim() &&
  Number(value.powerHp) > 0 &&
  value.compatibleEquipmentIds.length > 0;
