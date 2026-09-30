"use client";
import EquipmentSelect from "../equipment/EquipmentSelect";
import type { EquipmentIdentity } from "./types";
import { useMotorOptions } from "./use-motor-options";

export default function EquipmentCompatibilitySelect({
  value,
  onChange,
  seeds,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  seeds: EquipmentIdentity[];
  disabled: boolean;
}) {
  const options = useMotorOptions(true);
  return (
    <EquipmentSelect
      multiple
      label="Equipos compatibles"
      description="Selecciona una o varias unidades que admitan cambio de motor."
      required
      value={value}
      onChange={onChange}
      seeds={seeds}
      items={options.items}
      disabled={disabled}
      search={options.search}
      onSearch={options.onSearch}
      loading={options.loading}
      error={options.error}
      hasMore={options.hasMore}
      onLoadMore={options.next}
    />
  );
}
