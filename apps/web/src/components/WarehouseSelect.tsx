'use client';

import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Text } from '@mantine/core';
import { api, ApiError } from '@/lib/api';
import type { ReactNode } from 'react';

type Warehouse = {
  id: string;
  name: string;
};

type Props = {
  value: string | null;
  onChange: (warehouseId: string | null) => void;
  defaultName?: string;
  label?: ReactNode;
};

export default function WarehouseSelect({
  value,
  onChange,
  defaultName = 'Bodega principal',
  label = 'Location warehouse',
}: Props) {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nameMap = useMemo(() => {
    const map = new Map<string, Warehouse>();
    items.forEach((item) => map.set(item.name.toLowerCase(), item));
    return map;
  }, [items]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const data = await api<Warehouse[]>('/warehouses', { method: 'GET' });
        if (!mounted) return;
        setItems(data);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error loading warehouses');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!items.length) return;

    if (!value) {
      const desired = items.find(
        (item) => item.name.toLowerCase() === defaultName.toLowerCase()
      );
      const chosen = desired ?? items[0];
      if (chosen) {
        onChange(chosen.id);
        setInputValue(chosen.name);
        setError(null);
      }
      return;
    }

    const match = items.find((item) => item.id === value);
    if (match) {
      setInputValue(match.name);
      setError(null);
    }
  }, [items, value, defaultName, onChange]);

  const handleNameChange = (nextValue: string) => {
    setInputValue(nextValue);
    if (!nextValue.trim()) {
      setError(null);
      onChange(null);
      return;
    }

    const match = nameMap.get(nextValue.trim().toLowerCase());
    if (match) {
      setError(null);
      onChange(match.id);
      return;
    }

    setError('Selecciona una bodega valida');
    onChange(null);
  };

  const selectedName = useMemo(() => {
    if (!value) return '';
    return items.find((item) => item.id === value)?.name ?? '';
  }, [items, value]);

  return (
    <div>
      <Autocomplete
        label={label}
        placeholder={loading ? 'Cargando bodegas...' : 'Buscar por nombre'}
        data={items.map((warehouse) => warehouse.name)}
        value={inputValue}
        onChange={handleNameChange}
        disabled={loading}
        onFocus={() => {
          setError(null);
          setInputValue('');
        }}
        onBlur={() => {
          if (value && !inputValue.trim()) {
            setInputValue(selectedName);
          }
        }}
      />
      {error && (
        <Text c="red" size="sm" mt={4}>
          {error}
        </Text>
      )}
    </div>
  );
}
