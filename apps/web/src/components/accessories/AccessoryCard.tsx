"use client";

import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
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
        {item.internalCode ? (
          <Text size="sm">Código: {item.internalCode}</Text>
        ) : null}
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
          <Button size="xs" variant="light" onClick={onEdit}>
            Editar accesorio
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
      </Stack>
    </Card>
  );
}
