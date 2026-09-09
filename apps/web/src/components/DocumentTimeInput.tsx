'use client';

import { TextInput } from '@mantine/core';

type DocumentTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export default function DocumentTimeInput({ value, onChange, error }: DocumentTimeInputProps) {
  return (
    <TextInput
      label="Hora (24 horas)"
      description="HH:mm, de 00:00 a 23:59."
      placeholder="14:30"
      inputMode="numeric"
      maxLength={5}
      pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
      value={value}
      onChange={(event) => {
        const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }}
      error={error}
      required
    />
  );
}
