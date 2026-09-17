"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Card,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Location,
  MovementType,
  movementLabels,
  scopeLabels,
  AccessoryScope,
} from "./types";

type RevisionDetails = {
  name: string;
  description?: string;
  internalCode?: string;
  active?: boolean;
  scope: AccessoryScope;
  familyName?: string;
  compatibilityNames?: string[];
};
type History = {
  movements: Array<{
    id: string;
    type: MovementType;
    quantity: number;
    from?: Location;
    to?: Location;
    note: string;
    createdAt: string;
    createdBy: string;
    documentId?: string | null;
  }>;
  revisions: Array<{
    id: string;
    before: RevisionDetails;
    after: RevisionDetails;
    createdAt: string;
    createdBy: string;
  }>;
  hasMore: boolean;
};

export default function AccessoryHistory({
  accessoryId,
}: {
  accessoryId: string;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<History>(`/accessories/${accessoryId}/history?page=${page}`, {
      signal: controller.signal,
    })
      .then(setHistory)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessoryId, page]);
  return (
    <Stack>
      {error ? <Alert color="red">{error}</Alert> : null}
      {loading ? <Loader /> : null}
      {history?.movements.map((movement) => (
        <Card key={movement.id} withBorder>
          <Text fw={600}>
            {movementLabels[movement.type]} · {movement.quantity} unidad(es)
          </Text>
          <Text size="sm">
            {movement.from?.label ?? "Ingreso"} →{" "}
            {movement.to?.label ??
              (movement.type === "CONSUME" ? "Consumido" : "Baja")}
          </Text>
          <Text size="sm">{movement.note}</Text>
          {movement.documentId ? (
            <Anchor
              component={Link}
              href={`/inventory/ledger/document/${movement.documentId}`}
              size="sm"
            >
              Ver documento del movimiento
            </Anchor>
          ) : null}
          <Text size="xs" c="dimmed">
            {new Date(movement.createdAt).toLocaleString("es-CO")} · Usuario:{" "}
            {movement.createdBy}
          </Text>
        </Card>
      ))}
      {history?.revisions.length ? (
        <Text fw={600}>Ediciones de datos y compatibilidad</Text>
      ) : null}
      {history?.revisions.map((revision) => (
        <Card key={revision.id} withBorder>
          <Text size="sm">
            {revision.before.name} → {revision.after.name}
          </Text>
          <Text size="sm">
            {scopeLabels[revision.before.scope]} →{" "}
            {scopeLabels[revision.after.scope]}
          </Text>
          <Text size="sm">
            Antes: {revision.before.familyName ?? ""} ·{" "}
            {revision.before.compatibilityNames?.join(", ") ??
              "Sin detalle de destinos"}
          </Text>
          <Text size="sm">
            Después: {revision.after.familyName ?? ""} ·{" "}
            {revision.after.compatibilityNames?.join(", ") ??
              "Sin detalle de destinos"}
          </Text>
          {revision.before.internalCode !== revision.after.internalCode ? (
            <Text size="sm">
              Código: {revision.before.internalCode ?? "Sin código"} →{" "}
              {revision.after.internalCode ?? "Sin código"}
            </Text>
          ) : null}
          {revision.before.description !== revision.after.description ? (
            <Text size="sm">
              Descripción: {revision.before.description || "Sin descripción"} →{" "}
              {revision.after.description || "Sin descripción"}
            </Text>
          ) : null}
          {revision.before.active !== revision.after.active ? (
            <Text size="sm">
              Estado: {revision.after.active ? "Activo" : "Archivado"}
            </Text>
          ) : null}
          <Text size="xs" c="dimmed">
            {new Date(revision.createdAt).toLocaleString("es-CO")} · Usuario:{" "}
            {revision.createdBy}
          </Text>
        </Card>
      ))}
      <Button
        variant="default"
        disabled={page === 0 || loading}
        onClick={() => setPage((p) => p - 1)}
      >
        Anterior
      </Button>
      <Button
        variant="default"
        disabled={!history?.hasMore || loading}
        onClick={() => setPage((p) => p + 1)}
      >
        Siguiente
      </Button>
    </Stack>
  );
}
