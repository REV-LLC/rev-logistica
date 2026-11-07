"use client";
import Link from "next/link";
import { Alert, Badge, Button, Group, Loader, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import {
  billingOverviewPath,
  shortDate,
  useBillingOverview,
} from "@/lib/annex-billing-overview";
import styles from "@/app/home.module.css";

export default function AnnexBillingCard({
  office = false,
}: {
  office?: boolean;
}) {
  const { report, error, refresh, progress } = useBillingOverview();
  const pending = report?.rows.filter((row) => !row.invoiceNumber) ?? [];
  const customerCount = new Set(pending.map((row) => row.customerId)).size;
  const closed = pending.filter((row) => row.cutTo < report!.today);
  return (
    <section className={styles.billingCard} data-office={office}>
      <Group justify="space-between" align="center">
        <Text component="h2" fw={700} size="xl">
          Anexos sin facturar
        </Text>
        <Button
          component={Link}
          href={billingOverviewPath}
          variant="light"
          rightSection={<IconArrowRight size={16} />}
        >
          Abrir consolidado
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
          <Button variant="subtle" size="xs" onClick={refresh}>
            Reintentar
          </Button>
        </Alert>
      )}
      {!report && !error && (
        <Loader size="sm" aria-label="Consultando anexos" />
      )}
      {report && (
        <>
          <div className={styles.billingStats}>
            <strong>{pending.length}</strong>
            <div>
              <Text fw={600}>
                {pending.length === 1 ? "corte pendiente" : "cortes pendientes"}
              </Text>
              <Text size="sm" c="dimmed">
                {customerCount} {customerCount === 1 ? "cliente" : "clientes"} ·{" "}
                {closed.length}{" "}
                {closed.length === 1 ? "corte cerrado" : "cortes cerrados"}
              </Text>
            </div>
          </div>
          <Group gap="xs">
            {report.cuts.map((cut) => (
              <Badge
                key={cut.from}
                variant="light"
                color={cut.to < report.today ? "gray" : "blue"}
              >
                {shortDate(cut.from)} – {shortDate(cut.to)} ·{" "}
                {pending.filter((row) => row.cutFrom === cut.from).length}
              </Badge>
            ))}
          </Group>
          {!!report.reviews.length && (
            <Text size="xs" c="yellow">
              Hay obras con movimientos por revisar en el consolidado.
            </Text>
          )}
        </>
      )}
    </section>
  );
}
