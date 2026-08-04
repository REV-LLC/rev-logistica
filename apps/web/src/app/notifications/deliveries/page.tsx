"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconBrandWhatsapp,
  IconCheck,
  IconMail,
  IconRefresh,
  IconSearch,
  IconSend,
} from "@tabler/icons-react";
import AuthGuard from "@/components/AuthGuard";
import ResponsiveShell from "@/components/ResponsiveShell";
import { api } from "@/lib/api";

type Delivery = {
  id: string;
  channel: "EMAIL" | "WHATSAPP";
  status: "PENDING" | "SENDING" | "SENT" | "FAILED";
  kind: "DRAFT" | "FINAL" | string;
  recipient: string;
  subject: string;
  attachments: string[];
  sentAt?: string | null;
  createdAt: string;
  error?: string | null;
  legacy?: boolean;
  reference: {
    documentId: string;
    documentType: string;
    number?: string | null;
    label: string;
    customer?: string | null;
    worksite?: string | null;
    href: string;
  };
};

const statusPresentation = {
  SENT: { label: "Enviado", color: "green" },
  FAILED: { label: "Falló", color: "red" },
  SENDING: { label: "Enviando", color: "blue" },
  PENDING: { label: "Pendiente", color: "yellow" },
} as const;

function getStatusPresentation(status?: string | null) {
  if (status && status in statusPresentation) {
    return statusPresentation[status as keyof typeof statusPresentation];
  }

  return {
    label: status?.trim() || "Estado desconocido",
    color: "gray",
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DeliveryMetric({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof IconSend;
}) {
  return (
    <Paper withBorder radius="lg" p="md">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            {label}
          </Text>
          <Text fz={28} fw={750} lh={1.15} mt={4}>
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} radius="xl" size={42}>
          <Icon size={21} stroke={1.8} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export default function NotificationDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<string | null>("ALL");
  const [status, setStatus] = useState<string | null>("ALL");

  const loadDeliveries = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<unknown>(
        "/notifications/deliveries?limit=300",
      );
      if (!Array.isArray(response)) {
        const serverMessage =
          response &&
          typeof response === "object" &&
          "message" in response &&
          typeof response.message === "string"
            ? response.message
            : null;
        throw new Error(
          serverMessage ||
            "El servidor respondió con un formato inesperado. Intenta actualizar nuevamente.",
        );
      }
      setDeliveries(response as Delivery[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No fue posible cargar el historial.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDeliveries();
  }, []);

  const filteredDeliveries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return deliveries.filter((delivery) => {
      if (channel !== "ALL" && delivery.channel !== channel) return false;
      if (status !== "ALL" && delivery.status !== status) return false;
      if (!normalizedQuery) return true;
      return [
        delivery.recipient,
        delivery.subject,
        delivery.reference.label,
        delivery.reference.customer,
        delivery.reference.worksite,
        ...delivery.attachments,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("es").includes(normalizedQuery),
        );
    });
  }, [channel, deliveries, query, status]);

  const sentCount = deliveries.filter((item) => item.status === "SENT").length;
  const failedCount = deliveries.filter(
    (item) => item.status === "FAILED",
  ).length;
  const emailCount = deliveries.filter(
    (item) => item.channel === "EMAIL",
  ).length;
  const whatsappCount = deliveries.filter(
    (item) => item.channel === "WHATSAPP",
  ).length;

  return (
    <AuthGuard allowedRoles={["ADMIN", "OFFICE"]}>
      <ResponsiveShell>
        <Container size="xl" py="md">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>Centro de notificaciones</Title>
                <Text c="dimmed" mt={4}>
                  Trazabilidad de documentos enviados por correo y WhatsApp.
                </Text>
              </div>
              <Button
                variant="light"
                leftSection={<IconRefresh size={16} />}
                onClick={() => void loadDeliveries()}
                loading={loading}
              >
                Actualizar
              </Button>
            </Group>

            <SimpleGrid cols={{ base: 2, md: 4 }}>
              <DeliveryMetric
                label="Enviados"
                value={sentCount}
                color="green"
                icon={IconCheck}
              />
              <DeliveryMetric
                label="Fallidos"
                value={failedCount}
                color="red"
                icon={IconAlertTriangle}
              />
              <DeliveryMetric
                label="Correos"
                value={emailCount}
                color="blue"
                icon={IconMail}
              />
              <DeliveryMetric
                label="WhatsApp"
                value={whatsappCount}
                color="green"
                icon={IconBrandWhatsapp}
              />
            </SimpleGrid>

            <Paper withBorder radius="lg" p="md">
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <TextInput
                  label="Buscar"
                  placeholder="Documento, cliente o destinatario"
                  leftSection={<IconSearch size={15} />}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
                <Select
                  label="Canal"
                  value={channel}
                  onChange={setChannel}
                  allowDeselect={false}
                  data={[
                    { value: "ALL", label: "Todos los canales" },
                    { value: "EMAIL", label: "Correo" },
                    { value: "WHATSAPP", label: "WhatsApp" },
                  ]}
                />
                <Select
                  label="Estado"
                  value={status}
                  onChange={setStatus}
                  allowDeselect={false}
                  data={[
                    { value: "ALL", label: "Todos los estados" },
                    { value: "SENT", label: "Enviado" },
                    { value: "FAILED", label: "Falló" },
                    { value: "SENDING", label: "Enviando" },
                    { value: "PENDING", label: "Pendiente" },
                  ]}
                />
              </SimpleGrid>
            </Paper>

            {error ? (
              <Alert color="red" title="No se pudo cargar">
                {error}
              </Alert>
            ) : null}

            <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
              {loading && !deliveries.length ? (
                <Group justify="center" py={60}>
                  <Loader size="sm" />
                  <Text c="dimmed">Cargando historial…</Text>
                </Group>
              ) : (
                <>
                  <ScrollArea visibleFrom="sm">
                    <Table
                      verticalSpacing="sm"
                      horizontalSpacing="md"
                      miw={980}
                    >
                      <Table.Thead bg="gray.0">
                        <Table.Tr>
                          <Table.Th>Estado</Table.Th>
                          <Table.Th>Canal</Table.Th>
                          <Table.Th>Referencia</Table.Th>
                          <Table.Th>Destinatario</Table.Th>
                          <Table.Th>Contenido</Table.Th>
                          <Table.Th>Fecha</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {filteredDeliveries.map((delivery) => {
                          const presentation = getStatusPresentation(
                            delivery.status,
                          );
                          return (
                            <Table.Tr key={delivery.id}>
                              <Table.Td>
                                <Badge
                                  color={presentation.color}
                                  variant="light"
                                >
                                  {presentation.label}
                                </Badge>
                                {delivery.error ? (
                                  <Text size="xs" c="red" mt={5} maw={180}>
                                    {delivery.error}
                                  </Text>
                                ) : null}
                              </Table.Td>
                              <Table.Td>
                                <Group gap={7} wrap="nowrap">
                                  {delivery.channel === "EMAIL" ? (
                                    <IconMail size={17} color="#2563eb" />
                                  ) : (
                                    <IconBrandWhatsapp
                                      size={18}
                                      color="#16a34a"
                                    />
                                  )}
                                  <Text size="sm" fw={650}>
                                    {delivery.channel === "EMAIL"
                                      ? "Correo"
                                      : "WhatsApp"}
                                  </Text>
                                </Group>
                                <Text size="xs" c="dimmed" mt={3}>
                                  {delivery.kind === "FINAL"
                                    ? "Documento final"
                                    : "Borrador"}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text
                                  component={Link}
                                  href={delivery.reference.href}
                                  fw={700}
                                  size="sm"
                                  c="blue"
                                >
                                  {delivery.reference.label}
                                </Text>
                                <Text size="xs" c="dimmed" mt={3}>
                                  {[
                                    delivery.reference.customer,
                                    delivery.reference.worksite,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Sin cliente u obra"}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" fw={600}>
                                  {delivery.recipient}
                                </Text>
                                <Text size="xs" c="dimmed" mt={3}>
                                  {delivery.subject}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                {delivery.attachments.length ? (
                                  <Stack gap={2}>
                                    {delivery.attachments
                                      .slice(0, 3)
                                      .map((attachment) => (
                                        <Text key={attachment} size="xs">
                                          {attachment}
                                        </Text>
                                      ))}
                                    {delivery.attachments.length > 3 ? (
                                      <Text size="xs" c="dimmed">
                                        +{delivery.attachments.length - 3}{" "}
                                        archivos
                                      </Text>
                                    ) : null}
                                  </Stack>
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    Sin archivo registrado
                                  </Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm">
                                  {formatDateTime(
                                    delivery.sentAt || delivery.createdAt,
                                  )}
                                </Text>
                                {delivery.legacy ? (
                                  <Text size="xs" c="dimmed" mt={3}>
                                    Registro anterior
                                  </Text>
                                ) : null}
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                        {!filteredDeliveries.length ? (
                          <Table.Tr>
                            <Table.Td colSpan={6}>
                              <Text ta="center" c="dimmed" py="xl">
                                No hay envíos que coincidan con los filtros.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ) : null}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                  <Box hiddenFrom="sm" p="sm">
                    <Stack gap="sm">
                      {filteredDeliveries.map((delivery) => {
                        const presentation = getStatusPresentation(
                          delivery.status,
                        );
                        return (
                          <Paper
                            key={delivery.id}
                            withBorder
                            radius="md"
                            p="sm"
                          >
                            <Group
                              justify="space-between"
                              align="flex-start"
                              wrap="nowrap"
                            >
                              <div>
                                <Text
                                  component={Link}
                                  href={delivery.reference.href}
                                  fw={700}
                                  size="sm"
                                  c="blue"
                                >
                                  {delivery.reference.label}
                                </Text>
                                <Text size="xs" c="dimmed" mt={2}>
                                  {[
                                    delivery.reference.customer,
                                    delivery.reference.worksite,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Sin cliente u obra"}
                                </Text>
                              </div>
                              <Badge
                                color={presentation.color}
                                variant="light"
                                size="sm"
                              >
                                {presentation.label}
                              </Badge>
                            </Group>
                            <Group gap={7} mt="sm">
                              {delivery.channel === "EMAIL" ? (
                                <IconMail size={16} color="#2563eb" />
                              ) : (
                                <IconBrandWhatsapp size={17} color="#16a34a" />
                              )}
                              <Text size="sm" fw={650}>
                                {delivery.channel === "EMAIL"
                                  ? "Correo"
                                  : "WhatsApp"}{" "}
                                · {delivery.recipient}
                              </Text>
                            </Group>
                            <Text size="xs" c="dimmed" mt={6}>
                              {delivery.subject}
                            </Text>
                            {delivery.attachments.length ? (
                              <Text size="xs" mt={8}>
                                {delivery.attachments.length}{" "}
                                {delivery.attachments.length === 1
                                  ? "archivo"
                                  : "archivos"}
                                : {delivery.attachments.slice(0, 2).join(", ")}
                              </Text>
                            ) : null}
                            {delivery.error ? (
                              <Text size="xs" c="red" mt={6}>
                                {delivery.error}
                              </Text>
                            ) : null}
                            <Text size="xs" c="dimmed" mt={8}>
                              {formatDateTime(
                                delivery.sentAt || delivery.createdAt,
                              )}
                            </Text>
                          </Paper>
                        );
                      })}
                      {!filteredDeliveries.length ? (
                        <Text ta="center" c="dimmed" py="xl">
                          No hay envíos que coincidan con los filtros.
                        </Text>
                      ) : null}
                    </Stack>
                  </Box>
                </>
              )}
            </Paper>
          </Stack>
        </Container>
      </ResponsiveShell>
    </AuthGuard>
  );
}
