"use client";
import {
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TextInput,
} from "@mantine/core";
import {
  motorDescription,
  type EquipmentIdentity,
  type MotorForm,
} from "./types";
import EquipmentCompatibilitySelect from "./EquipmentCompatibilitySelect";

export default function MotorDetailsFields({
  value,
  onChange,
  seeds,
  disabled,
}: {
  value: MotorForm;
  onChange: (value: MotorForm) => void;
  seeds: EquipmentIdentity[];
  disabled: boolean;
}) {
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          required
          label="Marca"
          maxLength={160}
          value={value.brand}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, brand: e.currentTarget.value })}
        />
        <NumberInput
          required
          label="Potencia (HP)"
          min={0.01}
          max={999999.99}
          decimalScale={2}
          value={value.powerHp}
          disabled={disabled}
          onChange={(powerHp) => onChange({ ...value, powerHp })}
        />
        <TextInput
          required
          label="Modelo"
          maxLength={160}
          value={value.model}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, model: e.currentTarget.value })}
        />
        <Select
          required
          label="Tipo de motor"
          data={[
            { value: "ELECTRICO", label: "Eléctrico" },
            { value: "GASOLINA", label: "Gasolina" },
          ]}
          value={value.fuel}
          disabled={disabled}
          allowDeselect={false}
          onChange={(fuel) =>
            onChange({ ...value, fuel: fuel as MotorForm["fuel"] })
          }
        />
      </SimpleGrid>
      <TextInput
        label="Descripción automática"
        value={motorDescription(value)}
        readOnly
      />
      <EquipmentCompatibilitySelect
        value={value.compatibleEquipmentIds}
        seeds={seeds}
        disabled={disabled}
        onChange={(compatibleEquipmentIds) =>
          onChange({ ...value, compatibleEquipmentIds })
        }
      />
    </Stack>
  );
}
