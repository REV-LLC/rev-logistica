"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "@/lib/api";
import { Accessory, kindLabels, scopeLabels } from "./types";

export default function ExistingAccessoryPicker({
  familyId,
  onSelect,
  onCancel,
}: {
  familyId: string;
  onSelect: (item: Accessory) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{
    items: Accessory[];
    hasMore: boolean;
  }>({ items: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      familyId,
      search: query,
      page: String(page),
    });
    api<typeof result>(`/accessories?${params}`, { signal: controller.signal })
      .then(setResult)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [familyId, page, query]);
  return (
    <Stack>
      <Text size="sm">
        Selecciona un accesorio de esta familia. Podrás revisar y guardar su
        compatibilidad antes de asignar existencias.
      </Text>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(0);
        }}
      >
        <Group align="flex-end">
          <TextInput
            label="Buscar accesorio existente"
            maxLength={160}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button type="submit">Buscar</Button>
        </Group>
      </form>
      {error ? <Alert color="red">{error}</Alert> : null}
      {loading ? (
        <Loader />
      ) : (
        result.items.map((item) => (
          <Card key={item.id} withBorder>
            <Text fw={600}>
              {item.name} {item.internalCode ?? ""}
            </Text>
            <Text size="sm">
              {kindLabels[item.kind]} · {scopeLabels[item.scope]} ·{" "}
              {item.ownerWarehouse.name}
            </Text>
            <Button
              mt="sm"
              variant="light"
              disabled={!item.active}
              onClick={() => onSelect(item)}
            >
              {item.active ? "Revisar vinculación" : "Archivado"}
            </Button>
          </Card>
        ))
      )}
      {!loading && !result.items.length ? (
        <Text c="dimmed">No hay accesorios para esta búsqueda.</Text>
      ) : null}
      <Group>
        <Button
          variant="default"
          disabled={!page || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="default"
          disabled={!result.hasMore || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </Group>
      <Button variant="default" onClick={onCancel}>
        Cancelar
      </Button>
    </Stack>
  );
}
