"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Group, Popover, Stack, Text } from "@mantine/core";
import { IconReceipt } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/api";
import { shortDate } from "@/lib/annex-billing-overview";
import { InvoiceNumberFields } from "../invoice-number-fields";
import type { Draft } from "../types";

export default function AssignInvoicePopover({
  draftId,
  siteName,
  onAssigned,
  onRefresh,
}: {
  draftId: string;
  siteName: string;
  onAssigned: (invoice: string) => void;
  onRefresh: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<{
    revision: number;
    from: string;
    through: string;
  } | null>(null);
  const [invoice, setInvoice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    api<Draft>(`/annexes/drafts/${draftId}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((draft) => {
        if (controller.signal.aborted) return;
        const latest = draft.revisions[0];
        if (latest.invoiceNumber) {
          setError(
            "Este anexo ya tiene la factura " + latest.invoiceNumber + ".",
          );
          onRefresh();
          return;
        }
        setSaved({
          revision: draft.revision,
          from: draft.periodFrom.slice(0, 10),
          through: latest.through.slice(0, 10),
        });
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [opened, draftId, attempt, onRefresh]);

  function open() {
    setSaved(null);
    setInvoice("");
    setError("");
    setOpened(true);
  }

  async function assign() {
    if (!saved || !invoice || saving) return;
    setSaving(true);
    setError("");
    try {
      await api(`/annexes/drafts/${draftId}/invoice`, {
        method: "POST",
        json: { expectedRevision: saved.revision, invoiceNumber: invoice },
      });
      setOpened(false);
      onAssigned(invoice);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSaved(null);
        onRefresh();
      }
      setError(
        e instanceof Error ? e.message : "No se pudo asignar la factura.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      opened={opened}
      onDismiss={() => !saving && setOpened(false)}
      closeOnEscape={!saving}
      closeOnClickOutside={!saving}
      position="bottom-end"
      width="min(24rem, calc(100vw - 24px))"
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconReceipt size={15} />}
          onClick={() => (opened ? !saving && setOpened(false) : open())}
        >
          Asignar factura
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        {opened && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void assign();
            }}
          >
            <Stack gap="sm">
              <div>
                <Text fw={600}>Asignar factura</Text>
                <Text size="sm">{siteName}</Text>
                {saved && (
                  <Text size="xs" c="dimmed">
                    Anexo guardado · {shortDate(saved.from)} –{" "}
                    {shortDate(saved.through)}
                  </Text>
                )}
              </div>
              <InvoiceNumberFields onChange={setInvoice} disabled={saving} />
              {!saved && !error && (
                <Text size="xs" role="status">
                  Consultando anexo…
                </Text>
              )}
              {error && (
                <Alert color="red" role="alert">
                  {error}{" "}
                  {!saved && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() => {
                        setError("");
                        setAttempt((n) => n + 1);
                      }}
                    >
                      Volver a consultar
                    </Button>
                  )}
                </Alert>
              )}
              <Group justify="flex-end" gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  disabled={saving}
                  onClick={() => setOpened(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="xs"
                  type="submit"
                  loading={saving}
                  disabled={!invoice || !saved}
                >
                  Confirmar
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
