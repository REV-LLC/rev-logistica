"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconBrandWhatsapp, IconFileText } from "@tabler/icons-react";
import {
  overviewAnnexUrl,
  shortDate,
  useBillingOverview,
} from "@/lib/annex-billing-overview";
import ReminderSettings from "./reminder-settings";
import AssignInvoicePopover from "./assign-invoice-popover";

export default function BillingOverviewPage() {
  const { report, error, refresh, progress } = useBillingOverview();
  const [reminders, setReminders] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [customer, setCustomer] = useState<string | null>(null);
  const [cutFrom, setCutFrom] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const selected =
    report?.rows.filter(
      (row) =>
        (!customer || row.customerId === customer) &&
        (!cutFrom || row.cutFrom === cutFrom),
    ) ?? [];
  const pending = selected.filter((row) => !row.invoiceNumber);
  const billed = selected.filter((row) => row.invoiceNumber);
  const visible = filter === "pending" ? pending : billed;
  const customers = new Map(
    report?.rows.map((r) => [r.customerId, r.customerName]),
  );
  const reviews =
    report?.reviews.filter(
      (row) =>
        (!customer || row.customerId === customer) &&
        (!cutFrom || cutFrom === row.cutFrom),
    ) ?? [];
  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group data-page-heading-glass justify="space-between">
          <div>
            <Link href="/billing/annexes">Volver a anexos</Link>
            <Title order={1} mt="xs">
              Consolidado de facturación
            </Title>
          </div>
          <Button
            leftSection={<IconBrandWhatsapp size={18} />}
            variant="light"
            onClick={() => setReminders(true)}
          >
            Recordatorios de WhatsApp
          </Button>
        </Group>
        {progress && (
          <Text size="sm" c="dimmed" role="status">
            Consultando actividad de las obras
            {progress.total
              ? ` · ${progress.processed} de ${progress.total} cortes`
              : "…"}
          </Text>
        )}
        {error && (
          <Alert color="red">
            {error}{" "}
            <Button size="xs" variant="subtle" onClick={refresh}>
              Reintentar
            </Button>
          </Alert>
        )}
        {!report && !error && <Loader aria-label="Consultando obras" />}
        {report && (
          <>
            <Group align="flex-end">
              <Select
                label="Cliente"
                placeholder="Todos los clientes"
                searchable
                clearable
                value={customer}
                onChange={setCustomer}
                data={[...customers]
                  .map(([value, label]) => ({ value, label }))
                  .sort((a, b) => a.label.localeCompare(b.label, "es"))}
              />
              <Select
                label="Quincena"
                placeholder="Las cuatro quincenas"
                clearable
                value={cutFrom}
                onChange={setCutFrom}
                data={report.cuts.map((c) => ({
                  value: c.from,
                  label: shortDate(c.from) + " – " + shortDate(c.to),
                }))}
              />
              <SegmentedControl
                aria-label="Estado de facturación"
                value={filter}
                onChange={setFilter}
                data={[
                  {
                    value: "pending",
                    label: `Sin factura (${pending.length})`,
                  },
                  { value: "billed", label: `Facturados (${billed.length})` },
                ]}
              />
            </Group>
            {notice && (
              <Alert
                color="green"
                role="status"
                withCloseButton
                closeButtonLabel="Cerrar aviso"
                onClose={() => setNotice("")}
              >
                {notice}
              </Alert>
            )}
            {reviews.length > 0 && (
              <Alert color="yellow" title="Movimientos por revisar">
                <details>
                  <summary>
                    {reviews.length} cortes requieren revisión del inventario
                  </summary>
                  {reviews.map((r) => (
                    <Text component="div" size="sm" key={r.siteId + r.cutFrom}>
                      <Link
                        href={overviewAnnexUrl({
                          ...r,
                          from: r.cutFrom,
                          to: r.cutTo,
                          through:
                            r.cutTo > report.today ? report.today : r.cutTo,
                          draftId: null,
                          invoiceNumber: null,
                        })}
                      >
                        {r.customerName} · {r.siteName} · {shortDate(r.cutFrom)}{" "}
                        – {shortDate(r.cutTo)}
                      </Link>
                    </Text>
                  ))}
                </details>
              </Alert>
            )}
            {report.cuts
              .filter((c) => !cutFrom || c.from === cutFrom)
              .map((cut) => {
                const rows = visible.filter((row) => row.cutFrom === cut.from);
                return (
                  <Paper withBorder radius="md" p="md" key={cut.from}>
                    <Group justify="space-between" mb="sm">
                      <Group gap="xs">
                        <Title order={3}>
                          {shortDate(cut.from)} – {shortDate(cut.to)}
                        </Title>
                        {cut.to >= report.today && (
                          <Badge variant="light">
                            En curso · al {shortDate(report.today)}
                          </Badge>
                        )}
                      </Group>
                      <Text c="dimmed" size="sm">
                        {rows.length} cortes
                      </Text>
                    </Group>
                    {rows.length ? (
                      <Table.ScrollContainer minWidth={760}>
                        <Table highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Cliente</Table.Th>
                              <Table.Th>Obra</Table.Th>
                              <Table.Th>Período</Table.Th>
                              <Table.Th>
                                {filter === "pending" ? "Anexo" : "Factura"}
                              </Table.Th>
                              <Table.Th>Acciones</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {rows.map((r) => (
                              <Table.Tr
                                key={
                                  r.siteId + r.from + r.to + (r.draftId ?? "")
                                }
                              >
                                <Table.Td>{r.customerName}</Table.Td>
                                <Table.Td>{r.siteName}</Table.Td>
                                <Table.Td>
                                  {shortDate(r.from)} – {shortDate(r.to)}
                                </Table.Td>
                                <Table.Td>
                                  {r.invoiceNumber ||
                                    (r.draftId ? "Guardado" : "Por generar")}
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs" wrap="nowrap">
                                    <Button
                                      component={Link}
                                      href={overviewAnnexUrl(r)}
                                      prefetch={false}
                                      size="xs"
                                      variant="default"
                                      leftSection={<IconFileText size={15} />}
                                    >
                                      Abrir anexo
                                    </Button>
                                    {r.draftId && !r.invoiceNumber && (
                                      <AssignInvoicePopover
                                        draftId={r.draftId}
                                        siteName={r.siteName}
                                        onRefresh={refresh}
                                        onAssigned={(invoice) => {
                                          setNotice(
                                            `Factura ${invoice} asignada al anexo de ${r.siteName}.`,
                                          );
                                          refresh();
                                        }}
                                      />
                                    )}
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    ) : (
                      <Text c="dimmed" size="sm">
                        {filter === "pending"
                          ? "Sin cortes pendientes."
                          : "Sin cortes facturados."}
                      </Text>
                    )}
                  </Paper>
                );
              })}
          </>
        )}
      </Stack>
      <ReminderSettings
        opened={reminders}
        onClose={() => setReminders(false)}
      />
    </Container>
  );
}
