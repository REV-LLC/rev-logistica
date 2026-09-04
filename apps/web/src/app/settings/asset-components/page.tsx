'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
  exclusiveGroup: string | null;
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
  const [exclusiveGroup, setExclusiveGroup] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
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
    setExclusiveGroup('');
    setEditingId(null);
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
      await api(editingId ? `/asset-families/components/${editingId}` : `/asset-families/${parentId}/components`, {
        method: editingId ? 'PATCH' : 'POST',
        json: {
          componentAssetFamilyId: componentId,
          required: exclusiveGroup.trim() ? false : required,
          minimumQuantity: exclusiveGroup.trim() ? 0 : Number(minimum) || 0,
          maximumQuantity: exclusiveGroup.trim() ? 1 : maximum === '' ? null : Number(maximum),
          exclusiveGroup: exclusiveGroup.trim() || null,
          sortOrder: editingId
            ? rules.find((rule) => rule.id === editingId)?.sortOrder ?? 0
            : rules.filter((rule) => rule.parentAssetFamilyId === parentId).length * 10 + 10,
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
          description="Compatibilidad por familias, no por nombres. Agrupa implementos alternativos para elegir máximo uno por equipo en cada documento."
          icon={<IconLink size={24} />}
          iconColor="blue"
          accentColor="rgba(37, 99, 235, 0.12)"
        >
          <Group justify="flex-end">
            <Button leftSection={<IconPlus size={16} />} onClick={() => { reset(); setOpened(true); }}>
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
                    <Table.Td>{rule.componentAssetFamily.name}{rule.exclusiveGroup ? <Text size="xs" c="blue">{rule.exclusiveGroup} · elegir uno entre alternativas</Text> : null}</Table.Td>
                    <Table.Td><Badge variant="light">{rule.componentAssetFamily.controlType}</Badge></Table.Td>
                    <Table.Td>
                      {rule.required ? 'Obligatorio' : 'Opcional'} · mín. {rule.minimumQuantity}
                      {rule.maximumQuantity == null ? '' : ` · máx. ${rule.maximumQuantity}`}
                    </Table.Td>
                    <Table.Td><Switch checked={rule.active} onChange={() => void toggle(rule).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo actualizar.'))} /></Table.Td>
                    <Table.Td>
                      <Button variant="subtle" size="xs" onClick={() => {
                        setEditingId(rule.id); setParentId(rule.parentAssetFamilyId); setComponentId(rule.componentAssetFamilyId);
                        setRequired(rule.required); setMinimum(rule.minimumQuantity); setMaximum(rule.maximumQuantity ?? '');
                        setExclusiveGroup(rule.exclusiveGroup ?? ''); setError(null); setOpened(true);
                      }}>Editar</Button>
                      <Button color="red" variant="subtle" size="xs" leftSection={<IconTrash size={14} />} onClick={() => {
                        if (window.confirm('¿Eliminar esta compatibilidad? No se eliminan los assets del inventario.')) void remove(rule).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo eliminar.'));
                      }}>
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

      <Modal opened={opened} onClose={() => { if (!saving) { setOpened(false); reset(); } }} title={editingId ? 'Editar compatibilidad' : 'Nueva relación de componentes'} centered>
        <Stack>
          {error ? <Alert color="red">{error}</Alert> : null}
          <Select disabled={Boolean(editingId)} searchable label="Familia del equipo principal" data={familyOptions.filter((option) => families.find((family) => family.id === option.value)?.controlType === 'SERIAL')} value={parentId} onChange={(value) => { setParentId(value); setComponentId(null); }} />
          <Select searchable label="Familia componente" data={componentOptions} value={componentId} onChange={setComponentId} />
          <Autocomplete
            label="Grupo de alternativas (opcional)"
            description="Usa el mismo grupo para balde, martillo y uñas: solo se podrá elegir uno. No garantiza compatibilidad física entre modelos."
            placeholder="IMPLEMENTO FRONTAL"
            value={exclusiveGroup}
            onChange={setExclusiveGroup}
            data={[...new Set(rules.filter((rule) => rule.parentAssetFamilyId === parentId && rule.exclusiveGroup).map((rule) => rule.exclusiveGroup!))]}
          />
          {exclusiveGroup.trim() ? <Alert color="blue">Alternativa opcional: mínimo 0, máximo 1 entre todas las familias de este grupo. Solo admite assets serializados.</Alert> : null}
          <Switch disabled={Boolean(exclusiveGroup.trim())} label="Componente obligatorio" checked={exclusiveGroup.trim() ? false : required} onChange={(event) => { setRequired(event.currentTarget.checked); if (event.currentTarget.checked && Number(minimum) < 1) setMinimum(1); }} />
          <Group grow align="end">
            <NumberInput disabled={Boolean(exclusiveGroup.trim())} label="Cantidad mínima" min={0} value={exclusiveGroup.trim() ? 0 : minimum} onChange={setMinimum} />
            <NumberInput disabled={Boolean(exclusiveGroup.trim())} label="Cantidad máxima" min={0} placeholder="Sin límite" value={exclusiveGroup.trim() ? 1 : maximum} onChange={setMaximum} />
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
