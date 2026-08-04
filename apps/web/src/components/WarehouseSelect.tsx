'use client';

import { forwardRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Select } from '@mantine/core';
import { api, ApiError } from '@/lib/api';

export type WarehouseSelectItem = {
  id: string;
  name: string;
  type?: 'OWN' | 'ALLY' | string;
};

type WarehouseSelectProps = {
  value: string | null;
  onChange: (warehouseId: string | null) => void;
  warehouses?: readonly WarehouseSelectItem[];
  defaultName?: string;
  label?: ReactNode;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  clearable?: boolean;
  error?: ReactNode;
  width?: string | number;
  formatLabels?: boolean;
};

export function formatWarehouseSelectLabel(warehouse: WarehouseSelectItem) {
  if (warehouse.type === 'OWN') return 'Bodega propia';
  if (warehouse.type === 'ALLY') return `${warehouse.name} (Alterna)`;
  return warehouse.name;
}

const WarehouseSelect = forwardRef<HTMLInputElement, WarehouseSelectProps>(
  function WarehouseSelect(
    {
      value,
      onChange,
      warehouses,
      defaultName,
      label = 'Bodega',
      placeholder = 'Buscar bodega',
      name,
      disabled = false,
      loading = false,
      required = false,
      clearable = true,
      error,
      width,
      formatLabels = true,
    },
    ref,
  ) {
    const [loadedWarehouses, setLoadedWarehouses] = useState<WarehouseSelectItem[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [internalLoading, setInternalLoading] = useState(false);

    useEffect(() => {
      if (warehouses) return;
      let mounted = true;
      const load = async () => {
        setInternalLoading(true);
        setLoadError(null);
        try {
          const data = await api<WarehouseSelectItem[]>('/warehouses', { method: 'GET' });
          if (mounted) setLoadedWarehouses(data);
        } catch (err) {
          if (!mounted) return;
          setLoadError(
            err instanceof ApiError
              ? `${err.status}: ${err.message}`
              : 'No se pudieron cargar las bodegas.',
          );
        } finally {
          if (mounted) setInternalLoading(false);
        }
      };
      void load();
      return () => {
        mounted = false;
      };
    }, [warehouses]);

    const items = warehouses ?? loadedWarehouses;
    const options = useMemo(
      () =>
        [...items]
          .sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name, 'es');
            if (a.type === 'OWN') return -1;
            if (b.type === 'OWN') return 1;
            return a.name.localeCompare(b.name, 'es');
          })
          .map((warehouse) => ({
            value: warehouse.id,
            label: formatLabels ? formatWarehouseSelectLabel(warehouse) : warehouse.name,
          })),
      [formatLabels, items],
    );

    useEffect(() => {
      if (value || !defaultName || !items.length) return;
      const normalizedDefault = defaultName.trim().toLocaleLowerCase('es');
      const preferred = items.find(
        (warehouse) =>
          warehouse.name.trim().toLocaleLowerCase('es') === normalizedDefault ||
          (normalizedDefault === 'bodega propia' && warehouse.type === 'OWN'),
      );
      if (preferred) onChange(preferred.id);
    }, [defaultName, items, onChange, value]);

    const isLoading = loading || internalLoading;

    return (
      <Select
        ref={ref}
        label={label}
        name={name}
        value={value}
        onChange={onChange}
        data={options}
        searchable
        clearable={clearable}
        disabled={disabled || isLoading}
        required={required}
        error={error ?? loadError}
        placeholder={isLoading ? 'Cargando bodegas...' : placeholder}
        nothingFoundMessage="No se encontraron bodegas"
        w={width}
      />
    );
  },
);

export default WarehouseSelect;
