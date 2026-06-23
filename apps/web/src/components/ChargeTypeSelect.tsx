'use client';

import { Select, type SelectProps } from '@mantine/core';

export type ChargeType = 'DAY' | 'HOUR';

const CHARGE_TYPE_OPTIONS = [
  { value: 'DAY', label: 'Por día' },
  { value: 'HOUR', label: 'Por hora' },
] as const;

type Props = Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
  value: ChargeType;
  onChange: (value: ChargeType) => void;
};

export default function ChargeTypeSelect({
  label = 'Cobro',
  value,
  onChange,
  ...props
}: Props) {
  return (
    <Select
      label={label}
      data={CHARGE_TYPE_OPTIONS}
      value={value}
      onChange={(nextValue) => onChange((nextValue as ChargeType | null) ?? 'DAY')}
      {...props}
    />
  );
}