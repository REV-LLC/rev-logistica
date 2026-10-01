import type { EquipmentIdentity } from "../equipment/types";
export {
  equipmentLabel,
  equipmentName,
  equipmentImage,
} from "../equipment/types";
export type { EquipmentIdentity } from "../equipment/types";
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
