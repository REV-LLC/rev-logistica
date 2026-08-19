'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { IconLink, IconPlus, IconTrash } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api, ApiError } from '@/lib/api';

type Family = { id: string; code: string; name: string; controlType: 'BULK' | 'SERIAL' };
type Rule = {
  id: string;
  parentAssetFamilyId: string;
  componentAssetFamilyId: string;
  required: boolean;
  minimumQuantity: number;
  maximumQuantity: number | null;
  sortOrder: number;
  active: boolean;
  parentAssetFamily: Family;
  componentAssetFamily: Family;
};

export default function AssetComponentsSettingsPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [opened, setOpened] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [componentId, setComponentId] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [minimum, setMinimum] = useState<number | string>(0);
  const [maximum, setMaximum] = useState<number | string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [familyData, ruleData] = await Promise.all([
      api<Family[]>('/asset-families'),
      api<Rule[]>('/asset-families/components'),
    ]);
    setFamilies(familyData);
    setRules(ruleData);
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración.'));
  }, []);

  const familyOptions = useMemo(
    () => families.map((family) => ({ value: family.id, label: `${family.name} · ${family.controlType}` })),
    [families],
  );
  const componentOptions = familyOptions.filter((option) => option.value !== parentId);

  const reset = () => {
    setParentId(null);
    setComponentId(null);
    setRequired(false);
    setMinimum(0);
    setMaximum('');
    setError(null);
  };

  const save = async () => {
    if (!parentId || !componentId) {
      setError('Selecciona la familia principal y la familia componente.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/asset-families/${parentId}/components`, {
        method: 'POST',
        json: {
          componentAssetFamilyId: componentId,
          required,
          minimumQuantity: Number(minimum) || 0,
          maximumQuantity: maximum === '' ? null : Number(maximum),
          sortOrder: rules.filter((rule) => rule.parentAssetFamilyId === parentId).length * 10 + 10,
        },
      });
      await load();
      setOpened(false);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: Rule) => {
    await api(`/asset-families/components/${rule.id}`, {
      method: 'PATCH',
      json: {
        componentAssetFamilyId: rule.componentAssetFamilyId,
        required: rule.required,
        minimumQuantity: rule.minimumQuantity,
        maximumQuantity: rule.maximumQuantity,
        sortOrder: rule.sortOrder,
        active: !rule.active,
      },
    });
    await load();
  };

  const remove = async (rule: Rule) => {
    await api(`/asset-families/components/${rule.id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Componentes de equipos"
          description="Define qué familias pueden acompañar a cada tipo de equipo en una remisión."
          icon={<IconLink size={24} />}
          iconColor="blue"
          accentColor="rgba(37, 99, 235, 0.12)"
        >
          <Group justify="flex-end">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
              Nueva relación
            </Button>
          </Group>
        </PageHeaderCard>

        {error && !opened ? <Alert color="red">{error}</Alert> : null}
        <Paper withBorder radius="lg" p="md">
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Equipo principal</Table.Th>
                  <Table.Th>Componente permitido</Table.Th>
                  <Table.Th>Control</Table.Th>
                  <Table.Th>Cantidad</Table.Th>
                  <Table.Th>Activa</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rules.map((rule) => (
                  <Table.Tr key={rule.id}>
                    <Table.Td><Text fw={700}>{rule.parentAssetFamily.name}</Text></Table.Td>
                    <Table.Td>{rule.componentAssetFamily.name}</Table.Td>
                    <Table.Td><Badge variant="light">{rule.componentAssetFamily.controlType}</Badge></Table.Td>
                    <Table.Td>
                      {rule.required ? 'Obligatorio' : 'Opcional'} · mín. {rule.minimumQuantity}
                      {rule.maximumQuantity == null ? '' : ` · máx. ${rule.maximumQuantity}`}
                    </Table.Td>
                    <Table.Td><Switch checked={rule.active} onChange={() => void toggle(rule)} /></Table.Td>
                    <Table.Td>
                      <Button color="red" variant="subtle" size="xs" leftSection={<IconTrash size={14} />} onClick={() => void remove(rule)}>
                        Eliminar
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {!rules.length ? (
                  <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center">No hay relaciones configuradas.</Text></Table.Td></Table.Tr>
                ) : null}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={() => { setOpened(false); reset(); }} title="Nueva relación de componentes" centered>
        <Stack>
          {error ? <Alert color="red">{error}</Alert> : null}
          <Select searchable label="Familia del equipo principal" data={familyOptions} value={parentId} onChange={(value) => { setParentId(value); setComponentId(null); }} />
          <Select searchable label="Familia componente" data={componentOptions} value={componentId} onChange={setComponentId} />
          <Switch label="Componente obligatorio" checked={required} onChange={(event) => { setRequired(event.currentTarget.checked); if (event.currentTarget.checked && Number(minimum) < 1) setMinimum(1); }} />
          <Group grow align="end">
            <NumberInput label="Cantidad mínima" min={0} value={minimum} onChange={setMinimum} />
            <NumberInput label="Cantidad máxima" min={0} placeholder="Sin límite" value={maximum} onChange={setMaximum} />
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
            <Button loading={saving} onClick={() => void save()}>Guardar relación</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
