"use client";

import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import Link from 'next/link';
import {
  Accessory,
  balanceLabel,
  equipmentLabel,
  kindLabels,
  scopeLabels,
} from "./types";

export default function AccessoryCard({
  item,
  equipmentId,
  onEdit,
  onMove,
  onHistory,
}: {
  item: Accessory;
  equipmentId?: string;
  onEdit: () => void;
  onMove: () => void;
  onHistory: () => void;
}) {
  const assigned = item.balances
    .filter((b) => b.assetId === equipmentId)
    .reduce((sum, b) => sum + b.quantity, 0);
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>{item.name}</Text>
          <Badge color={item.kind === "INDIVIDUAL" ? "blue" : "orange"}>
            {kindLabels[item.kind]}
          </Badge>
        </Group>
        <Badge variant="light" color={item.purpose === 'COMPONENT' ? 'violet' : 'blue'}>{item.purpose === 'COMPONENT' ? 'Componente' : 'Accesorio'}</Badge>
        {item.exclusiveAssetId ? <Text size="sm">Exclusivo de su equipo; no intercambiable.</Text> : null}
        {!item.active ? <Badge color="gray">Archivado</Badge> : null}
        {item.description ? <Text size="sm">{item.description}</Text> : null}
        <Text size="sm">Propietario: {item.ownerWarehouse.name}</Text>
        <Text size="sm">
          {item.family.name} · {scopeLabels[item.scope]}
        </Text>
        {item.scope === "SUBFAMILIES" ? (
          <Text size="sm">
            {item.subfamilies.map((s) => s.subfamily.name).join(", ")}
          </Text>
        ) : null}
        {item.scope === "ASSETS" ? (
          <Text size="sm">
            {item.assets.map((a) => equipmentLabel(a.asset)).join(", ")}
          </Text>
        ) : null}
        {item.scope === 'ACCESSORIES' ? <Text size="sm">{item.compatibleParents?.map(p => p.parentAccessory.name).join(', ')}</Text> : null}
        {equipmentId ? (
          <Badge color={assigned ? "green" : "gray"} variant="light">
            {assigned
              ? `${assigned} asignado(s) a este equipo`
              : "Compatible · sin asignación a este equipo"}
          </Badge>
        ) : null}
        <Text fw={600} size="sm">
          Existencias: {item.balances.reduce((sum, b) => sum + b.quantity, 0)}
        </Text>
        {item.balances.map((balance) => (
          <Text key={balance.id} size="sm">
            {balance.quantity} · {balanceLabel(balance)}
            {balance.assetId ? " (asignado)" : ""}
          </Text>
        ))}
        <Group mt="auto">
          <Button component={Link} href={`/inventory/equipment-configuration/accessories/${item.id}`} size="xs" variant="default">{item.kind === 'INDIVIDUAL' && item.purpose !== 'COMPONENT' ? 'Conjunto y cobro' : 'Cobro'}</Button>
          <Button size="xs" variant="light" onClick={onEdit}>
            Editar {item.purpose === 'COMPONENT' ? 'componente' : 'accesorio'}
          </Button>
          <Button
            size="xs"
            onClick={onMove}
            disabled={
              !item.active ||
              (item.kind === "INDIVIDUAL" && !item.balances.length)
            }
          >
            Registrar movimiento
          </Button>
          <Button size="xs" variant="subtle" onClick={onHistory}>
            Historial
          </Button>
        </Group>
        {item.internalCode ? <details><Text component="summary" size="xs" c="dimmed" style={{ cursor: 'pointer' }}>Datos internos</Text><Text size="xs">Código: {item.internalCode}</Text></details> : null}
      </Stack>
    </Card>
  );
}
