"use client";
import { Group, Select, TextInput } from "@mantine/core";
import { useState } from "react";

export function InvoiceNumberFields({
  onChange,
  disabled,
}: {
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [prefix, setPrefix] = useState("FE");
  const [custom, setCustom] = useState("");
  const [sequence, setSequence] = useState("");
  function update(selected: string, other: string, digits: string) {
    setPrefix(selected);
    setCustom(other);
    setSequence(digits);
    const code = selected === "Otro" ? other : selected;
    onChange(
      /^[A-Z][A-Z0-9]{0,15}$/.test(code) && /^\d{1,40}$/.test(digits)
        ? code + "-" + digits
        : "",
    );
  }
  return (
    <Group align="flex-end" grow>
      <Select
        label="Prefijo"
        comboboxProps={{ withinPortal: false }}
        data={["FE", "FV", "NC", "ND", "Otro"]}
        value={prefix}
        allowDeselect={false}
        disabled={disabled}
        onChange={(value) => update(value || "FE", custom, sequence)}
      />
      {prefix === "Otro" && (
        <TextInput
          label="Otro prefijo"
          maxLength={16}
          value={custom}
          disabled={disabled}
          onChange={(e) =>
            update(prefix, e.currentTarget.value.trim().toUpperCase(), sequence)
          }
        />
      )}
      <TextInput
        label="Consecutivo"
        placeholder="Ej. 003862"
        inputMode="numeric"
        maxLength={40}
        value={sequence}
        disabled={disabled}
        onChange={(e) =>
          update(prefix, custom, e.currentTarget.value.replace(/\D/g, ""))
        }
      />
    </Group>
  );
}
