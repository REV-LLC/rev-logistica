"use client";
import { useState } from "react";
import { ActionIcon, Button, Group, Modal, Popover, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconCheck, IconPlus, IconSettings, IconTool } from "@tabler/icons-react";
import AppImage from '@/components/AppImage';
import ExistingPartPicker from "./ExistingPartPicker";
import NewImplementForm from './NewImplementForm';
import ConfigurationEntryOptions from "./ConfigurationEntryOptions";
import { type ConfigurationEntry, type EquipmentConfiguration, entryName } from "./types";
import classes from "./ConfigurationEditor.module.css";

type Props = {
  value: EquipmentConfiguration;
  onChange: (value: EquipmentConfiguration) => void;
  disabled?: boolean;
  canCreate?: boolean;
  accessoryParent?: boolean;
  onConfigurePart?: (rowId: string) => void;
};

export default function ConfigurationEditor({ value, onChange, disabled, accessoryParent = false, onConfigurePart }: Props) {
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [nativeCreating, setNativeCreating] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [editing, setEditing] = useState<ConfigurationEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const atLimit = value.entries.length >= 100;
  // The recommended route is archived for now. Retain its entries in value
  // when editing unit links, but do not expose or load the route editor.
  const compatible = value.entries.filter(row => !row.familyId);
  function select(entry: ConfigurationEntry) {
    if (entry.familyId) return;
    const exists = value.entries.some(row => (entry.assetId && entry.assetId === row.assetId) ||
      (entry.skuId && entry.skuId === row.skuId) || (entry.familyId && entry.familyId === row.familyId) ||
      (entry.accessoryId && entry.accessoryId === row.accessoryId));
    if (!exists) { setCreating(true); setEditing({ ...entry, required: false }); }
    setPicking(false); setNativeCreating(false);
  }
  function apply(row: ConfigurationEntry) {
    const next = { ...row, recommendation: row.recommendation || !!row.familyId, required: false };
    onChange({ ...value, entries: creating ? [...value.entries, next] : value.entries.map(item => item.id === row.id ? next : item) });
    setEditing(null); setCreating(false);
  }
  function remove(row: ConfigurationEntry) {
    onChange({ ...value, entries: value.entries.filter(item => item.id !== row.id).map(item =>
      row.familyId && item.templateParentFamilyId === row.familyId
        ? { ...item, templateParentFamilyId: row.templateParentFamilyId ?? null } : item) });
    setEditing(null);
  }
  function rows(entries: ConfigurationEntry[]) {
    return <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {entries.map(row => <ConfigurationCard key={row.id} row={row} disabled={disabled} onEdit={() => { setCreating(false); setEditing(row); }} />)}
    </SimpleGrid>;
  }
  return <Stack gap="xl">
    <section aria-label="Implementos compatibles">
      <Group justify="space-between" gap="sm" mb="md">
        <Text component="h2" className={classes.heading}>Implementos compatibles</Text>
        <Popover opened={adding} onChange={setAdding} position="bottom-end" width={280} shadow="md" withArrow>
          <Popover.Target><Button variant="default" leftSection={<IconPlus size={17} />} disabled={disabled || atLimit} onClick={() => setAdding(!adding)}>Agregar</Button></Popover.Target>
          <Popover.Dropdown style={{ maxWidth: 'calc(100vw - 24px)' }}>
            <Stack gap="sm">
              <Button variant="default" onClick={() => { setPicking(true); setAdding(false); }}>Elegir del inventario</Button>
              <Button onClick={() => { setNativeCreating(true); setAdding(false); }}>Crear implemento</Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
      {compatible.length ? rows(compatible) : <Text size="sm" c="dimmed">Sin implementos vinculados.</Text>}
    </section>
    <Modal opened={picking} onClose={() => setPicking(false)} title="Elegir implemento" size="lg" centered>
      {picking ? <ExistingPartPicker role="ACCESSORY" recommendation={false} onSelect={select} /> : null}
    </Modal>
    <Modal opened={nativeCreating} onClose={() => { if (!nativeBusy) setNativeCreating(false); }} title="Crear implemento" centered
      closeOnEscape={!nativeBusy} closeOnClickOutside={!nativeBusy} withCloseButton={!nativeBusy}>
      {nativeCreating ? <NewImplementForm initialFamilyId={value.parent?.familyId}
        initialOwnerWarehouseId={value.parent?.ownerWarehouseId} initialWarehouseId={value.parent?.warehouseId}
        onCreated={select} onBusyChange={setNativeBusy} /> : null}
    </Modal>
    {editing ? <ConfigurationEntryOptions key={editing.id} entry={editing} creating={creating} disabled={disabled} accessoryParent={accessoryParent}
      onCancel={() => { setEditing(null); setCreating(false); }} onApply={apply}
      onRemove={() => remove(editing)}
      onConfigurePart={onConfigurePart ? () => { setEditing(null); onConfigurePart(editing.id); } : undefined} /> : null}
  </Stack>;
}

function ConfigurationCard({ row, disabled, onEdit }: { row: ConfigurationEntry; disabled?: boolean; onEdit: () => void }) {
  const image = row.asset?.imageUrl ?? row.asset?.sku.imageUrl ?? row.sku?.imageUrl;
  const controlLabel = row.assetId ? 'Unidad individual'
    : row.skuId ? row.sku?.isConsumable ? 'Consumible · Por cantidad' : 'Retornable · Por cantidad'
    : row.accessory?.kind === 'INDIVIDUAL' ? 'Unidad individual · Registro anterior'
    : row.accessory?.kind === 'RETURNABLE' ? 'Por cantidad · Registro anterior'
    : row.accessory?.kind === 'CONSUMABLE' ? 'Consumible · Registro anterior'
    : 'Implemento';
  return <div className={classes.implementCard}>
    <div className={classes.cardImage}>
      {image ? <AppImage src={image} alt={entryName(row)} width={72} height={72} style={{ objectFit: 'contain' }} />
        : <IconTool size={32} />}
    </div>
    <Text fw={600} className={classes.name}>{entryName(row)}</Text>
    <Text size="sm" c="dimmed">{controlLabel}</Text>
    <Group justify="space-between" mt="sm">
      {row.defaultIncluded ? <span className={classes.included} aria-label="Recomendado por defecto"><IconCheck size={20} /></span> : <span />}
      <ActionIcon size="lg" variant="default" disabled={disabled} aria-label={`Configurar ${entryName(row)}`} onClick={onEdit}><IconSettings size={20} /></ActionIcon>
    </Group>
  </div>;
}
