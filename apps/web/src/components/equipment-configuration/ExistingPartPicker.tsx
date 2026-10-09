"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  SimpleGrid,
} from "@mantine/core";
import { api } from "@/lib/api";
import { type ConfigurationEntry, type PartRole, entryName } from "./types";

export default function ExistingPartPicker({
  role,
  recommendation = false,
  onSelect,
}: {
  role: PartRole;
  recommendation?: boolean;
  onSelect: (entry: ConfigurationEntry) => void;
}) {
  const [source, setSource] = useState(recommendation ? "families" : "assets");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ConfigurationEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const base = {
          role,
          recommendation,
          quantity: 1,
          required: false,
          defaultIncluded: false,
        };
        if (source === "parts") {
          const data = await api<{
            items: NonNullable<
              ConfigurationEntry["accessory"] & { active: boolean }
            >[];
            hasMore: boolean;
          }>(
            `/accessories?search=${encodeURIComponent(query)}&page=${page}`,
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) {
            setItems(
              data.items
                .filter((p) => p.active)
                .map((accessory) => ({
                  ...base,
                  id: crypto.randomUUID(),
                  accessoryId: accessory.id,
                  accessory,
                })),
            );
            setMore(data.hasMore);
          }
        } else if (source === 'bulk') {
          const skus = await api<Array<NonNullable<ConfigurationEntry['sku']> & { active: boolean; isImplement: boolean }>>('/skus?controlType=BULK', { signal: controller.signal });
          if (!controller.signal.aborted) {
            const filtered = skus.filter(sku => sku.active && sku.isImplement && sku.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
            setItems(filtered.slice(page * 50, (page + 1) * 50).map(sku => ({ ...base, id: crypto.randomUUID(), skuId: sku.id, sku })));
            setMore(filtered.length > (page + 1) * 50);
          }
        } else if (source === 'families') {
          const families = await api<NonNullable<ConfigurationEntry['family']>[]>('/asset-families', { signal: controller.signal });
          if (!controller.signal.aborted) {
            const filtered = families.filter(family => family.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
            setItems(filtered.slice(page * 50, (page + 1) * 50).map(family => ({ ...base, defaultIncluded: false,
              id: crypto.randomUUID(), familyId: family.id, family })));
            setMore(filtered.length > (page + 1) * 50);
          }
        } else {
          const data = await api<{
            items: NonNullable<ConfigurationEntry["asset"]>[];
            hasMore: boolean;
          }>(
            `/equipment-configurations/asset-candidates?implementsOnly=true&search=${encodeURIComponent(query)}&page=${page}`,
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) {
            setItems(
              data.items.map((asset) => ({
                ...base,
                id: crypto.randomUUID(),
                assetId: asset.id,
                asset,
              })),
            );
            setMore(data.hasMore);
          }
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el inventario.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [source, query, page, role, recommendation]);
  return (
    <Stack>
      {!recommendation ? <Select
        label="Buscar en"
        value={source}
        allowDeselect={false}
        onChange={(v) => {
          setSource(v!);
          setPage(0);
        }}
        data={[
          {
            value: "parts",
            label:
              "Implementos anteriores",
          },
          {
            value: "assets",
            label: "Unidades individuales",
          },
          { value: 'bulk', label: 'Implementos por cantidad' },
        ]}
      /> : null}
      <Group align="end">
        <TextInput
          label={recommendation ? 'Buscar familia' : 'Buscar elemento'}
          placeholder={recommendation ? 'Nombre de la familia' : 'Nombre, serial o código'}
          value={search}
          maxLength={160}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Button
          type="button"
          onClick={() => {
            setQuery(search.trim());
            setPage(0);
          }}
        >
          Buscar
        </Button>
      </Group>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Loader aria-label="Cargando elementos" />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>{items.map((row) => (
          <Card withBorder key={row.id}>
            <Group justify="space-between">
              <div>
                <Text>{entryName(row)}</Text>
                {row.familyId ? <Text size="xs" c="dimmed">Recomendación para documentos</Text> : null}
              </div>
              <Button type="button" onClick={() => onSelect(row)}>
                Agregar
              </Button>
            </Group>
          </Card>
        ))}</SimpleGrid>
      )}
      {!loading && !items.length ? (
        <Text>No hay resultados para esta búsqueda.</Text>
      ) : null}
      <Group>
        <Button
          type="button"
          disabled={loading || !page}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          disabled={loading || !more}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </Group>
    </Stack>
  );
}
