"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconFolder,
  IconFileInvoice,
  IconChevronRight,
  IconSearch,
} from "@tabler/icons-react";
import { api } from "@/lib/api";
import { annexBrowseUrl } from "@/lib/annex-url";
type Folder = {
  id: string;
  name: string;
  worksiteCount?: number;
  annexCount?: number;
};
type File = {
  id: string;
  revision: number;
  periodFrom: string;
  periodTo: string;
  revisions: {
    through: string;
    invoiceNumber: string | null;
    createdAt: string;
  }[];
};
type Library = {
  customers?: Folder[];
  customer?: Folder;
  worksite?: Folder;
  worksites?: Folder[];
  annexes?: File[];
  nextCursor?: string | null;
};
const date = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/");
export default function AnnexLibrary({
  customerId,
  worksiteId,
  disabled,
  onNavigate,
}: {
  customerId: string | null;
  worksiteId: string | null;
  disabled: boolean;
  onNavigate: (customer: string | null, worksite: string | null) => void;
}) {
  const [data, setData] = useState<Library | null>(null),
    [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false),
    [more, setMore] = useState(false),
    [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const moreRequest = useRef<AbortController | null>(null);
  const endpoint = (cursor?: string) => {
    const params = new URLSearchParams();
    if (customerId) params.set("customerId", customerId);
    if (worksiteId) params.set("customerWorksiteId", worksiteId);
    if (cursor) params.set("cursor", cursor);
    return `/annexes/library?${params}`;
  };
  useEffect(() => {
    const controller = new AbortController();
    moreRequest.current?.abort();
    setMore(false);
    setLoading(true);
    setData(null);
    setSearch("");
    setError(null);
    api<Library>(endpoint(), { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el explorador.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [customerId, worksiteId, retry]);
  async function loadMore() {
    if (!data?.nextCursor || more) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setMore(true);
    setError(null);
    try {
      const next = await api<Library>(endpoint(data.nextCursor), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setData((current) =>
        current
          ? {
              ...next,
              annexes: [...(current.annexes ?? []), ...(next.annexes ?? [])],
            }
          : next,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar más anexos.",
      );
    } finally {
      if (!controller.signal.aborted) setMore(false);
    }
  }
  const folders = (data?.customers ?? data?.worksites ?? []).filter((folder) =>
    folder.name
      .toLocaleLowerCase("es-CO")
      .includes(search.toLocaleLowerCase("es-CO")),
  );
  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      aria-label="Explorador de anexos guardados"
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Title order={3}>Anexos guardados</Title>
            <Text size="sm" c="dimmed">
              Clientes → obras → anexos
            </Text>
          </div>
        </Group>
        <Group gap={4} aria-label="Ubicación del explorador">
          <Button
            size="compact-sm"
            variant="subtle"
            disabled={disabled || loading}
            onClick={() => onNavigate(null, null)}
          >
            Todos los clientes
          </Button>
          {data?.customer && (
            <>
              <IconChevronRight size={14} />
              <Button
                size="compact-sm"
                variant="subtle"
                disabled={disabled || loading}
                onClick={() => onNavigate(data.customer!.id, null)}
              >
                {data.customer.name}
              </Button>
            </>
          )}
          {data?.worksite && (
            <>
              <IconChevronRight size={14} />
              <Text size="sm" fw={600}>
                {data.worksite.name}
              </Text>
            </>
          )}
        </Group>
        {loading && (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Cargando carpetas…</Text>
          </Group>
        )}
        {error && (
          <Alert color="red">
            {error}
            <Button
              ml="xs"
              size="compact-xs"
              variant="subtle"
              onClick={() => setRetry((value) => value + 1)}
            >
              Reintentar
            </Button>
          </Alert>
        )}
        {!loading && data && !data.annexes && (
          <>
            <TextInput
              aria-label={customerId ? "Buscar obra" : "Buscar cliente"}
              placeholder={customerId ? "Buscar obra" : "Buscar cliente"}
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <ScrollArea.Autosize mah={420} type="auto">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {folders.map((folder) => (
                  <Button
                    key={folder.id}
                    variant="default"
                    h="auto"
                    py="md"
                    justify="start"
                    disabled={disabled}
                    onClick={() =>
                      onNavigate(
                        customerId ?? folder.id,
                        customerId ? folder.id : null,
                      )
                    }
                    styles={{
                      label: {
                        whiteSpace: "normal",
                        textAlign: "left",
                        width: "100%",
                      },
                    }}
                  >
                    <Group wrap="nowrap">
                      <IconFolder
                        size={30}
                        color="var(--mantine-color-blue-3)"
                        style={{ flexShrink: 0 }}
                      />
                      <div>
                        <Text
                          fw={600}
                          size="sm"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {folder.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {customerId
                            ? `${folder.annexCount ?? 0} anexos`
                            : `${folder.worksiteCount ?? 0} obras`}
                        </Text>
                      </div>
                    </Group>
                  </Button>
                ))}
              </SimpleGrid>
            </ScrollArea.Autosize>
            {!folders.length && (
              <Text size="sm" c="dimmed">
                No hay {customerId ? "obras" : "clientes"} para mostrar.
              </Text>
            )}
          </>
        )}
        {!loading && data?.annexes && (
          <>
            {!data.annexes.length && (
              <Text size="sm" c="dimmed">
                Esta obra todavía no tiene anexos guardados. Puedes generar uno
                con el selector de abajo.
              </Text>
            )}
            <ScrollArea.Autosize mah={420} type="auto">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {data.annexes.map((file) => {
                  const latest = file.revisions[0];
                  return (
                    <Paper key={file.id} withBorder radius="md" p="sm">
                      <Stack gap="xs">
                        <Group gap="xs">
                          <IconFileInvoice size={22} />
                          <Text size="sm" fw={600}>
                            {date(file.periodFrom)} —{" "}
                            {date(latest?.through ?? file.periodTo)}
                          </Text>
                        </Group>
                        <Group gap="xs">
                          <Badge
                            maw="100%"
                            title={latest?.invoiceNumber ?? "Sin facturar"}
                            color={latest?.invoiceNumber ? "green" : "gray"}
                            variant="light"
                          >
                            {latest?.invoiceNumber
                              ? `Facturado · ${latest.invoiceNumber}`
                              : "Sin facturar"}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            Versión {file.revision}
                          </Text>
                        </Group>
                        {latest && (
                          <Text size="xs" c="dimmed">
                            Guardado el{" "}
                            {new Date(latest.createdAt).toLocaleDateString(
                              "es-CO",
                              { timeZone: "America/Bogota" },
                            )}
                          </Text>
                        )}
                        <Button
                          size="xs"
                          variant="light"
                          component="a"
                          aria-disabled={disabled}
                          onClick={(event) => {
                            if (disabled) event.preventDefault();
                          }}
                          href={annexBrowseUrl({
                            customer: data.customer!.id,
                            worksite: data.worksite!.id,
                            draft: file.id,
                            period: {
                              from: file.periodFrom.slice(0, 10),
                              to: file.periodTo.slice(0, 10),
                              through: (latest?.through ?? file.periodTo).slice(
                                0,
                                10,
                              ),
                            },
                          })}
                        >
                          Abrir anexo
                        </Button>
                      </Stack>
                    </Paper>
                  );
                })}
              </SimpleGrid>
            </ScrollArea.Autosize>
            {data.nextCursor && (
              <Button
                variant="light"
                loading={more}
                disabled={disabled}
                onClick={loadMore}
              >
                Cargar más anexos
              </Button>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
