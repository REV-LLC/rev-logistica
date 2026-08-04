"use client";

import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconDownload,
  IconEye,
  IconFilePlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api, apiBlob, ApiError } from "@/lib/api";
import MobilityGuideStatus from "./MobilityGuideStatus";
import PublishProviderMobilityGuideModal, {
  MobilityGuideProvider,
} from "./PublishProviderMobilityGuideModal";

type ProviderGuide = {
  id: string;
  name: string;
  machineReference: string;
  issuedAt: string;
  expiresAt: string;
  provider: MobilityGuideProvider;
  fileObject: { id: string; originalName?: string | null };
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));

export default function ProviderMobilityGuidesPanel({
  canManage,
}: {
  canManage: boolean;
}) {
  const [providers, setProviders] = useState<MobilityGuideProvider[]>([]);
  const [guides, setGuides] = useState<ProviderGuide[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishOpened, setPublishOpened] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );

  const loadGuides = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (providerId) params.set("providerId", providerId);
    try {
      setGuides(
        await api<ProviderGuide[]>(
          `/mobility-guides/provider-guides${params.size ? `?${params}` : ""}`,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las guias de proveedores.",
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, providerId]);

  useEffect(() => {
    api<MobilityGuideProvider[]>("/mobility-guides/providers")
      .then(setProviders)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los proveedores.",
        ),
      );
  }, []);

  useEffect(() => {
    loadGuides();
  }, [loadGuides]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const loadBlob = async (guide: ProviderGuide) => {
    setBusyId(guide.id);
    setError(null);
    try {
      return await apiBlob(`/files/${guide.fileObject.id}/download`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo abrir el archivo.",
      );
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const openPreview = async (guide: ProviderGuide) => {
    const blob = await loadBlob(guide);
    if (!blob) return;
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(blob), name: guide.name });
  };

  const download = async (guide: ProviderGuide) => {
    const blob = await loadBlob(guide);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = guide.fileObject.originalName || `${guide.name}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (guide: ProviderGuide) => {
    if (!window.confirm(`¿Eliminar la guia "${guide.name}"?`)) return;
    setBusyId(guide.id);
    try {
      await api(`/mobility-guides/provider-guides/${guide.id}`, {
        method: "DELETE",
      });
      setGuides((items) => items.filter((item) => item.id !== guide.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar la guia.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Stack gap="lg" mt="lg">
        <Group justify="space-between" align="flex-end">
          <Text c="dimmed">
            Guias de todos los proveedores, conservadas durante seis meses.
          </Text>
          {canManage ? (
            <Button
              leftSection={<IconFilePlus size={18} />}
              onClick={() => setPublishOpened(true)}
            >
              Publicar guia de proveedor
            </Button>
          ) : null}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            aria-label="Buscar guias de proveedores"
            placeholder="Buscar proveedor o referencia"
            leftSection={<IconSearch size={18} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Select
            searchable
            clearable
            placeholder="Todos los proveedores"
            value={providerId}
            onChange={setProviderId}
            data={providers.map((provider) => ({
              value: provider.id,
              label: provider.name,
            }))}
          />
        </SimpleGrid>
        {error ? <Alert color="red">{error}</Alert> : null}
        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : null}
        {!loading && guides.length === 0 ? (
          <Paper withBorder p="xl" radius="lg">
            <Text ta="center" c="dimmed">
              No hay guias de proveedores publicadas.
            </Text>
          </Paper>
        ) : null}
        <Stack gap="sm">
          {guides.map((guide) => (
            <Paper key={guide.id} withBorder p="md" radius="lg">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={3}>
                  <Group gap="xs">
                    <Text fw={700}>{guide.name}</Text>
                    <MobilityGuideStatus expiresAt={guide.expiresAt} />
                  </Group>
                  <Text size="sm">
                    {guide.provider.name} · Referencia {guide.machineReference}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Expedicion: {formatDate(guide.issuedAt)} · Expiracion:{" "}
                    {formatDate(guide.expiresAt)}
                  </Text>
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    aria-label="Visualizar guia"
                    variant="light"
                    loading={busyId === guide.id}
                    onClick={() => openPreview(guide)}
                  >
                    <IconEye size={17} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label="Descargar guia"
                    variant="light"
                    onClick={() => download(guide)}
                  >
                    <IconDownload size={17} />
                  </ActionIcon>
                  {canManage ? (
                    <ActionIcon
                      aria-label="Eliminar guia"
                      color="red"
                      variant="light"
                      onClick={() => remove(guide)}
                    >
                      <IconTrash size={17} />
                    </ActionIcon>
                  ) : null}
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Stack>

      {canManage ? (
        <PublishProviderMobilityGuideModal
          providers={providers}
          opened={publishOpened}
          onClose={() => setPublishOpened(false)}
          onPublished={loadGuides}
        />
      ) : null}
      <Modal
        opened={Boolean(preview)}
        onClose={() => {
          if (preview) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
        title={preview?.name}
        size="90%"
        centered
      >
        {preview ? (
          <iframe
            src={preview.url}
            title={preview.name}
            style={{ width: "100%", height: "75vh", border: 0 }}
          />
        ) : null}
      </Modal>
    </>
  );
}
