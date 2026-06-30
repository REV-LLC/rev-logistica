'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Container, Group, Paper, SimpleGrid, Stack, Text, Textarea, ThemeIcon } from '@mantine/core';
import { IconDeviceFloppy, IconListDetails } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api, ApiError } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';

type CatalogOption = {
  groupKey: string;
  value: string;
  label: string;
  sortOrder: number;
  active: boolean;
};

const GROUPS = [
  {
    key: 'BULK_FORMWORK_LINES',
    title: 'Formaleta',
    description: 'Tipos principales usados para crear referencias de formaleta.',
  },
  {
    key: 'BULK_FORMWORK_HEIGHTS',
    title: 'Medidas formaleta',
    description: 'Altos Y disponibles en metros. Usa punto decimal: 2.40.',
  },
  {
    key: 'BULK_CERTIFIED_SCAFFOLD_PARTS',
    title: 'Andamio certificado',
    description: 'Piezas que aparecen en el selector de referencia.',
  },
  {
    key: 'BULK_CERTIFIED_SCAFFOLD_MEASURES',
    title: 'Medidas andamio certificado',
    description: 'Medidas para piezas que requieren dimension. Ej: 2.00M.',
  },
  {
    key: 'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE',
    title: 'Certificado sin medida',
    description: 'Piezas de andamio certificado que no deben pedir medida.',
  },
  {
    key: 'BULK_CONVENTIONAL_SCAFFOLD_PARTS',
    title: 'Andamio convencional',
    description: 'Piezas que aparecen en el selector de referencia.',
  },
  {
    key: 'BULK_CONVENTIONAL_SCAFFOLD_MEASURES',
    title: 'Medidas andamio convencional',
    description: 'Medidas para piezas convencionales que requieren dimension.',
  },
  {
    key: 'BULK_CONVENTIONAL_SCAFFOLD_WITH_MEASURE',
    title: 'Convencional con medida',
    description: 'Piezas convencionales que deben pedir medida.',
  },
  {
    key: 'SERIAL_ASSET_BRANDS',
    title: 'Marcas equipos seriales',
    description: 'Marcas disponibles al crear equipos unicos.',
  },
] as const;

const normalizeLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean);

export default function CatalogOptionsPage() {
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isAdmin = getCurrentUserRole() === 'ADMIN';

  const optionsByGroup = useMemo(() => {
    const map = new Map<string, CatalogOption[]>();
    GROUPS.forEach((group) => map.set(group.key, []));
    options.forEach((option) => {
      const rows = map.get(option.groupKey) ?? [];
      rows.push(option);
      map.set(option.groupKey, rows);
    });
    return map;
  }, [options]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api<CatalogOption[]>('/catalog/options')
      .then((data) => {
        if (!mounted) return;
        setOptions(data);
        const nextDrafts: Record<string, string> = {};
        GROUPS.forEach((group) => {
          nextDrafts[group.key] = data
            .filter((option) => option.groupKey === group.key && option.active)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((option) => option.label)
            .join('\n');
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('No se pudo cargar el catalogo');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const saveGroup = async (groupKey: string) => {
    setError(null);
    setSuccess(null);
    const lines = normalizeLines(drafts[groupKey] ?? '');
    if (!lines.length) {
      setError('Cada grupo debe tener al menos una opcion.');
      return;
    }

    setSavingKey(groupKey);
    try {
      const updated = await api<CatalogOption[]>(`/catalog/options/${groupKey}`, {
        method: 'PUT',
        json: {
          options: lines.map((line) => ({
            value: line,
            label: line,
            active: true,
          })),
        },
      });
      setOptions((current) => [
        ...current.filter((option) => option.groupKey !== groupKey),
        ...updated,
      ]);
      setDrafts((current) => ({ ...current, [groupKey]: lines.join('\n') }));
      setSuccess('Catalogo actualizado.');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo guardar el catalogo');
      }
    } finally {
      setSavingKey(null);
    }
  };

  if (!isAdmin) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" variant="light" title="Acceso restringido">
          Solo admin puede editar este catalogo.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Catalogo de inventario"
          description="Edita las opciones que aparecen al crear items por cantidad."
          icon={<IconListDetails size={20} />}
          iconColor="green"
          accentColor="rgba(22,163,74,0.12)"
        />

        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        {success ? <Alert color="green" variant="light">{success}</Alert> : null}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {GROUPS.map((group) => {
            const count = optionsByGroup.get(group.key)?.filter((option) => option.active).length ?? 0;
            return (
              <Paper key={group.key} withBorder radius="lg" p="md">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={800}>{group.title}</Text>
                      <Text size="sm" c="dimmed">{group.description}</Text>
                    </div>
                    <ThemeIcon color="green" variant="light" radius="xl">
                      <Text size="xs" fw={800}>{count}</Text>
                    </ThemeIcon>
                  </Group>
                  <Textarea
                    label="Opciones"
                    description="Una opcion por linea. Se guardan en mayuscula."
                    autosize
                    minRows={5}
                    value={drafts[group.key] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [group.key]: event.currentTarget.value,
                      }))
                    }
                    disabled={loading || savingKey === group.key}
                  />
                  <Group justify="flex-end">
                    <Button
                      leftSection={<IconDeviceFloppy size={16} />}
                      loading={savingKey === group.key}
                      onClick={() => saveGroup(group.key)}
                    >
                      Guardar
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
