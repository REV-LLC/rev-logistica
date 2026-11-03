"use client";
import { openDatePicker } from "@/lib/date-picker";
import { newAnnexPeriod } from "@/lib/annex-url";
import glassStyles from "./annex-glass.module.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { startAnnexLiveRefresh } from "@/lib/annex-live-refresh";
import {
  ActionIcon,
  NumberInput,
  Table,
  Tooltip,
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  UnstyledButton,
  Container,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconPrinter,
  IconChevronDown,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { isDailyAnnex } from "@/lib/annex-daily-scope";
import { annexReviewNotices } from "@/lib/annex-review";
import { annexAmounts } from "@/lib/annex-totals";
import AnnexSheet from "./annex-sheet";
import AnnexTransport from "./annex-transport";
import AnnexLibrary from "./annex-library";
import selectorStyles from "./annex-selector.module.css";
import AnnexSend from "./annex-send";
import type { AnnexExport } from "@/lib/annex-pdf";
import { api } from "@/lib/api";
import { annexLocationUrl, readAnnexLocation } from "@/lib/annex-url";
import type {
  AnnexInput,
  Draft,
  MachineDay,
  Result,
  SourceIssue,
} from "./types";
type Consultation = {
  input: AnnexInput;
  result: Result;
  sourceIssues: SourceIssue[];
  revision: number;
  invoiceNumber?: string | null;
  draftId?: string | null;
};
function loadLive(
  site: string,
  period: AnnexInput["period"],
  signal?: AbortSignal,
) {
  return api<Consultation>(
    `/annexes/live?${new URLSearchParams({ customerWorksiteId: site, ...period })}`,
    { signal, cache: "no-store" },
  );
}
const money = (value: string) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(
    Number(value),
  );
function initialPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  // Start with the period containing the last complete business day.
  const yesterday = new Date(
    Date.parse(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`) -
      86400000,
  );
  const through = yesterday.toISOString().slice(0, 10),
    prefix = through.slice(0, 8);
  const second = yesterday.getUTCDate() > 15;
  return {
    from: `${prefix}${second ? "16" : "01"}`,
    to: through,
    through,
  };
}
export default function AnnexesPage() {
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [employees, setEmployees] = useState<
    { id: string; name: string; lastName: string }[]
  >([]);
  const [sites, setSites] = useState<
    { id: string; alias: string | null; worksite: { name: string } }[]
  >([]);
  const [customer, setCustomer] = useState<string | null>(null),
    [site, setSite] = useState<string | null>(null);
  const [period, setPeriod] = useState(initialPeriod);
  const [input, setInput] = useState<AnnexInput | null>(null),
    [result, setResult] = useState<Result | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(true);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [openedDraft, setOpenedDraft] = useState<string | null>(null);
  const [saveOpened, setSaveOpened] = useState(false);
  const [markInvoiced, setMarkInvoiced] = useState(false);
  const [invoiceTag, setInvoiceTag] = useState("");
  function openSave() {
    stopRefresh.current?.();
    setMarkInvoiced(!!invoiceNumber);
    setInvoiceTag(invoiceNumber ?? "");
    setSaveOpened(true);
  }

  const hasInput = input !== null;
  const historicalOnly = input !== null && !isDailyAnnex(input);
  useEffect(() => {
    setSelectorOpen(!hasInput);
  }, [hasInput]);
  const [issues, setIssues] = useState<SourceIssue[]>([]);
  const [revision, setRevision] = useState(0),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sendData, setSendData] = useState<AnnexExport | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const stopRefresh = useRef<(() => void) | null>(null);
  const foregroundRequest = useRef<AbortController | null>(null);
  useEffect(() => () => foregroundRequest.current?.abort(), []);
  const applyConsultation = useCallback((data: Consultation) => {
    setInput(data.input);
    setResult(data.result);
    setIssues(data.sourceIssues ?? []);
    setRevision(data.revision);
    setInvoiceNumber(data.invoiceNumber ?? null);
    setOpenedDraft(data.draftId ?? null);
    setLiveError(null);
  }, []);
  async function consult(targetPeriod = period) {
    if (!site) throw new Error("Selecciona una obra");
    stopRefresh.current?.();
    foregroundRequest.current?.abort();
    const controller = new AbortController();
    foregroundRequest.current = controller;
    const data = await loadLive(site, targetPeriod, controller.signal);
    if (controller.signal.aborted)
      throw new DOMException("Consulta cancelada", "AbortError");
    applyConsultation(data);
    return data;
  }
  const liveEnabled =
    hasInput &&
    !historicalOnly &&
    !invoiceNumber &&
    !editing &&
    !dirty &&
    !busy &&
    !printing &&
    !sendData &&
    !saveOpened;
  useEffect(() => {
    if (!liveEnabled || !site) return;
    const stop = startAnnexLiveRefresh({
      window,
      document,
      load: (signal) => loadLive(site, period, signal),
      apply: applyConsultation,
      onError: () =>
        setLiveError(
          "No se pudo actualizar el anexo. Se volverá a intentar automáticamente al recuperar la conexión.",
        ),
    });
    stopRefresh.current = stop;
    return () => {
      stop();
      if (stopRefresh.current === stop) stopRefresh.current = null;
    };
  }, [
    liveEnabled,
    site,
    period.from,
    period.to,
    period.through,
    applyConsultation,
  ]);
  const baseline = useRef<{
    input: AnnexInput;
    result: Result | null;
    issues: SourceIssue[];
    period: AnnexInput["period"];
    reason: string;
    dirty: boolean;
  } | null>(null);
  function beginEditing() {
    if (!input || busy || printing || historicalOnly) return;
    stopRefresh.current?.();
    baseline.current = structuredClone({
      input,
      result,
      issues,
      period,
      reason,
      dirty,
    });
    setEditing(true);
    // Older saved revisions need a fresh preview before exposing the new charges.
    if (result?.additionalChargesTotal === undefined) setResult(null);
    setMessage(null);
  }
  function cancelEditing() {
    const previous = baseline.current;
    if (!previous || busy) return;
    setInput(previous.input);
    setResult(previous.result);
    setIssues(previous.issues);
    setPeriod(previous.period);
    setReason(previous.reason);
    setDirty(previous.dirty);
    setEditing(false);
    setReport(null);
    setCalendarOpened(false);
    setError(null);
    setPreviewError(null);
    baseline.current = null;
    void prepare(previous.period);
  }
  const [calendarOpened, setCalendarOpened] = useState(false);
  const [reviewOpened, setReviewOpened] = useState(false);
  const [reportIndex, setReportIndex] = useState<number | null>(null),
    [report, setReport] = useState<MachineDay | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let location: ReturnType<typeof readAnnexLocation>;
    try {
      location = readAnnexLocation(window.location.search, initialPeriod());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enlace inválido");
      return;
    }
    if (!location) {
      setUrlReady(true);
      return;
    }
    const target = location;
    setCustomer(target.customer);
    setSite(target.worksite);
    setPeriod(target.period);
    if (!target.worksite || !target.customer) {
      setUrlReady(true);
      return;
    }
    setBusy(true);
    (async () => {
      try {
        const [available, stored, exactSaved] = await Promise.all([
          api<typeof sites>(`/customers/${target.customer}/worksites`, {
            signal: controller.signal,
          }),
          target.browse || target.draft
            ? Promise.resolve([] as Draft[])
            : api<Draft[]>(
                `/annexes/drafts?customerWorksiteId=${target.worksite}`,
                { signal: controller.signal },
              ),
          target.draft
            ? api<Draft>(
                `/annexes/drafts/${encodeURIComponent(target.draft)}`,
                { signal: controller.signal },
              )
            : Promise.resolve(undefined),
        ]);
        if (!available.some((s) => s.id === target.worksite))
          throw new Error(
            "La obra del enlace no pertenece al cliente o no está disponible.",
          );
        if (target.browse && !target.draft) {
          setSites(available);
          return;
        }
        const saved = target.draft
          ? exactSaved
          : stored.find(
              (d) =>
                d.periodFrom.slice(0, 10) === target.period.from &&
                d.periodTo.slice(0, 10) === target.period.to,
            );
        if (saved && saved.customerWorksiteId !== target.worksite)
          throw new Error(
            "El anexo del enlace no pertenece a la obra seleccionada.",
          );
        const latest = saved?.revisions[0];
        const historical =
          latest && (!isDailyAnnex(latest.input) || !!latest.invoiceNumber);
        const data = historical
          ? {
              ...latest,
              sourceIssues: latest.sourceIssues ?? [],
              revision: saved!.revision,
              invoiceNumber: latest.invoiceNumber ?? null,
              draftId: saved!.id,
            }
          : await loadLive(
              target.worksite!,
              latest?.input.period ?? target.period,
              controller.signal,
            );
        if (controller.signal.aborted) return;
        setSites(available);
        applyConsultation(data);
        setPeriod(data.input.period);
        setEditing(false);
        setDirty(false);
        setReason("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "No se pudo abrir el enlace",
          );
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          setUrlReady(true);
        }
      }
    })();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!urlReady || editing || busy) return;
    const next = annexLocationUrl(window.location.href, {
      customer,
      worksite: site,
      period: input?.period ?? period,
      browse: !input,
      ...(openedDraft ? { draft: openedDraft } : {}),
    });
    if (
      `${window.location.pathname}${window.location.search}${window.location.hash}` !==
      next
    )
      window.history.replaceState(window.history.state, "", next);
  }, [urlReady, editing, busy, customer, site, period, input, openedDraft]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<typeof customers>("/customers", { signal: controller.signal }),
      api<typeof employees>("/employees", { signal: controller.signal }),
    ])
      .then(([c, e]) => {
        setCustomers(c);
        setEmployees(e);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e.message));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!customer) return;
    const controller = new AbortController();
    api<typeof sites>(`/customers/${customer}/worksites`, {
      signal: controller.signal,
    })
      .then((s) => {
        if (!controller.signal.aborted) setSites(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [customer]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!input || result || busy || historicalOnly) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPreviewError(null);
      api<Result>("/annexes/preview", {
        method: "POST",
        json: input,
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted) setResult(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setPreviewError(e.message);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, result, busy, historicalOnly]);
  function edit(next: AnnexInput) {
    if (!editing || busy) return;
    setInput(next);
    setResult(null);
    setDirty(true);
    setMessage(null);
  }
  async function changeBillingMode(rentalId: string, modeId: string) {
    if (!input || !editing || busy) return;
    setBusy(true);
    try {
      const next = await api<AnnexInput>("/annexes/select-mode", {
        method: "POST",
        json: { input, rentalId, modeId },
      });
      setInput(next);
      setResult(null);
      setDirty(true);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }
  async function prepare(targetPeriod = period) {
    if (!site) return;
    setBusy(true);
    setError(null);
    try {
      const data = await consult(targetPeriod);
      setPeriod(data.input.period);
      setUrlReady(true);
      setEditing(false);
      setDirty(false);
      baseline.current = null;
      setReason("");
      setMessage(null);
    } catch (e) {
      setLiveError("No se pudo consultar la información actual del anexo.");
      setError(
        e instanceof Error ? e.message : "No se pudo consultar el anexo",
      );
    } finally {
      setBusy(false);
    }
  }
  async function calculate(save: boolean, selectedInvoice?: string | null) {
    if (!input || !site) return;
    stopRefresh.current?.();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (save) {
        const draft = await api<Draft>("/annexes/drafts", {
          method: "POST",
          json: {
            customerWorksiteId: site,
            expectedRevision: revision,
            ...(selectedInvoice !== undefined
              ? { invoiceNumber: selectedInvoice }
              : {}),
            reason:
              reason.trim() ||
              (revision
                ? "Actualización del anexo"
                : "Guardado inicial del anexo"),
            input,
            sourceIssues: issues,
          },
        });
        setRevision(draft.revision);
        setInvoiceNumber(draft.revisions[0].invoiceNumber ?? null);
        setOpenedDraft(draft.id);
        setSaveOpened(false);
        setInput(draft.revisions[0].input);
        setResult(draft.revisions[0].result);
        setDirty(false);
        setEditing(false);
        baseline.current = null;
        setMessage(`Anexo guardado · versión ${draft.revision}`);
        try {
          await consult(input.period);
        } catch {
          setLiveError(
            "Los cambios se guardaron, pero no se pudo actualizar el anexo con los últimos movimientos. Se reintentará automáticamente.",
          );
        }
      } else
        setResult(
          await api<Result>("/annexes/preview", {
            method: "POST",
            json: input,
          }),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular");
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    stopRefresh.current?.();
    foregroundRequest.current?.abort();
    setLiveError(null);
    setUrlReady(true);
    setEditing(false);
    baseline.current = null;
    setSendData(null);
    setInput(null);
    setResult(null);
    setIssues([]);
    setRevision(0);
    setInvoiceNumber(null);
    setOpenedDraft(null);
    setSaveOpened(false);
    setDirty(false);
    setReason("");
    setMessage(null);
    setError(null);
    setPreviewError(null);
    setReport(null);
    setCalendarOpened(false);
    setReviewOpened(false);
    setPeriod(newAnnexPeriod(period.from, period.through));
  }
  function changeContext() {
    if (busy || printing) return false;
    if (
      dirty &&
      !window.confirm("Se descartarán los cambios sin guardar. ¿Continuar?")
    )
      return false;
    reset();
    return true;
  }
  function changeDate(key: "from" | "through", value: string) {
    if (value === period[key]) return;
    if (!changeContext()) return;
    setPeriod(
      newAnnexPeriod(
        key === "from" ? value : period.from,
        key === "through" ? value : period.through,
      ),
    );
  }
  const [extrasSupported, setExtrasSupported] = useState(false);
  useEffect(() => {
    if (result?.summary) setExtrasSupported(true);
  }, [result]);
  const vatPercent = input?.policy.vatPercent ?? 0;
  const taxTotals = result
    ? annexAmounts(
        result.totals,
        input?.transport,
        vatPercent,
        input?.additionalCharges,
      )
    : null;
  return (
    <Container
      fluid
      py="xs"
      className={`${glassStyles.theme} ${glassStyles.page}`}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Title order={1}>Anexos</Title>
            <Text c="dimmed">
              Prepara y revisa el alquiler por cliente y obra.
            </Text>
          </div>
          <Badge color={editing ? "orange" : "blue"}>
            {editing
              ? "Editando"
              : invoiceNumber
                ? "Facturado"
                : historicalOnly || !input
                  ? "Consulta"
                  : liveError
                    ? "Sin actualizar"
                    : "En vivo"}
            {revision ? ` · versión ${revision}` : ""}
          </Badge>
        </Group>
        {input && (
          <Group>
            <Button
              size="xs"
              variant="light"
              disabled={busy || printing}
              onClick={() => changeContext()}
            >
              Volver al explorador
            </Button>
            {invoiceNumber && (
              <Badge color="green" size="lg" maw="100%" title={invoiceNumber}>
                Facturado · {invoiceNumber}
              </Badge>
            )}
          </Group>
        )}
        {!input && (
          <AnnexLibrary
            customerId={customer}
            worksiteId={site}
            disabled={busy || printing}
            onNavigate={(nextCustomer, nextSite) => {
              if (!changeContext()) return;
              setCustomer(nextCustomer);
              setSite(nextSite);
            }}
          />
        )}
        {error ? (
          <Alert color="red" title="No se pudo completar">
            {error}
          </Alert>
        ) : null}
        {liveError ? <Alert color="yellow">{liveError}</Alert> : null}
        {message ? <Alert color="green">{message}</Alert> : null}
        <Paper withBorder radius="md" className={selectorStyles.card}>
          <UnstyledButton
            className={selectorStyles.trigger}
            aria-label="Cliente, obra y período"
            aria-expanded={selectorOpen}
            aria-controls="annex-context-fields"
            onClick={() => setSelectorOpen((open) => !open)}
          >
            <div className={selectorStyles.summary}>
              <Text fw={600} size="md">
                {customers.find((c) => c.id === customer)?.name ??
                  "Seleccionar cliente y obra"}
              </Text>
              <Text size="sm" c="dimmed">
                {sites.find((s) => s.id === site)?.alias ||
                  sites.find((s) => s.id === site)?.worksite.name ||
                  "Obra por seleccionar"}{" "}
                · {period.from.split("-").reverse().join("/")} –{" "}
                {(input?.period.through ?? period.through)
                  .split("-")
                  .reverse()
                  .join("/")}
              </Text>
            </div>
            <IconChevronDown
              size={20}
              aria-hidden="true"
              className={selectorStyles.chevron}
              style={{ transform: selectorOpen ? "rotate(180deg)" : undefined }}
            />
          </UnstyledButton>
          <Collapse in={selectorOpen} transitionDuration={180}>
            <div id="annex-context-fields" className={selectorStyles.fields}>
              <Stack>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label="Cliente"
                    searchable
                    data={customers.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                    value={customer}
                    disabled={busy || printing}
                    onChange={(v) => {
                      if (v === customer || !changeContext()) return;
                      setCustomer(v);
                      setSites([]);
                      setSite(null);
                    }}
                  />
                  <Select
                    label="Obra"
                    searchable
                    data={sites.map((s) => ({
                      value: s.id,
                      label: s.alias || s.worksite.name,
                    }))}
                    value={site}
                    disabled={busy || printing || !customer}
                    onChange={(v) => {
                      if (v === site || !changeContext()) return;
                      setSite(v);
                    }}
                  />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {(["from", "through"] as const).map((key) => (
                    <TextInput
                      key={key}
                      type="date"
                      onClick={(event) => openDatePicker(event.currentTarget)}
                      label={
                        {
                          from: "Inicio del corte",
                          through: "Fin del corte",
                        }[key]
                      }
                      value={period[key]}
                      min={key === "through" ? period.from : undefined}
                      disabled={busy || printing}
                      onChange={(e) => changeDate(key, e.currentTarget.value)}
                    />
                  ))}
                </SimpleGrid>
                <Group>
                  <Button
                    onClick={() => prepare()}
                    disabled={!site || input !== null}
                    loading={busy && !input}
                  >
                    Ver anexo desde inventario
                  </Button>
                </Group>
              </Stack>
            </div>
          </Collapse>
        </Paper>
        {input ? (
          <>
            {historicalOnly ? (
              <Alert color="yellow">
                Anexo histórico de otra modalidad: disponible solo para
                consulta. Los nuevos anexos admiten únicamente alquileres por
                día.
              </Alert>
            ) : null}
            <AnnexSheet
              key={site}
              customerName={
                customers.find((c) => c.id === customer)?.name ?? "Cliente"
              }
              worksiteName={
                sites.find((s) => s.id === site)?.alias ||
                sites.find((s) => s.id === site)?.worksite.name ||
                "Obra"
              }
              employees={employees}
              customerWorksiteId={site!}
              input={input}
              result={result}
              busy={busy}
              editing={editing}
              actions={
                <Group gap="xs">
                  {editing ? (
                    <>
                      <Tooltip label="Guardar cambios" withinPortal>
                        <ActionIcon
                          size={28}
                          p={2}
                          aria-label="Guardar cambios"
                          loading={busy}
                          disabled={period.through !== input.period.through}
                          onClick={openSave}
                        >
                          <IconDeviceFloppy size={20} />
                        </ActionIcon>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="default"
                        disabled={busy || printing}
                        onClick={cancelEditing}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="xs"
                        disabled={busy || printing || historicalOnly}
                        onClick={beginEditing}
                      >
                        Editar
                      </Button>
                      {!revision ? (
                        <Tooltip label="Guardar anexo" withinPortal>
                          <ActionIcon
                            size={28}
                            p={2}
                            aria-label="Guardar anexo"
                            variant="light"
                            loading={busy}
                            disabled={historicalOnly || printing}
                            onClick={openSave}
                          >
                            <IconDeviceFloppy size={20} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </>
                  )}
                  <Tooltip label="Imprimir anexo" withinPortal>
                    <ActionIcon
                      size={28}
                      p={2}
                      aria-label="Imprimir anexo"
                      variant="light"
                      loading={printing}
                      disabled={
                        historicalOnly ||
                        editing ||
                        busy ||
                        printing ||
                        !result ||
                        dirty
                      }
                      onClick={async () => {
                        if (!result) return;
                        const preview = window.open("about:blank", "_blank");
                        if (!preview) {
                          setError(
                            "Permite las ventanas emergentes para imprimir el anexo.",
                          );
                          return;
                        }
                        preview.opener = null;
                        stopRefresh.current?.();
                        setPrinting(true);
                        try {
                          const current = await consult();
                          const { createAnnexPdf } =
                            await import("@/lib/annex-pdf");
                          const blob = await createAnnexPdf(
                            {
                              input: current.input,
                              result: current.result,
                              revision: current.revision,
                              issues: current.sourceIssues,
                              customer:
                                customers.find((c) => c.id === customer)
                                  ?.name ?? "Cliente",
                              worksite:
                                sites.find((s) => s.id === site)?.alias ||
                                sites.find((s) => s.id === site)?.worksite
                                  .name ||
                                "Obra",
                            },
                            { print: true },
                          );
                          const url = URL.createObjectURL(blob);
                          if (!preview.closed) preview.location.replace(url);
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        } catch (error) {
                          preview.close();
                          setError(
                            error instanceof Error
                              ? error.message
                              : "No se pudo imprimir el anexo",
                          );
                        } finally {
                          setPrinting(false);
                        }
                      }}
                    >
                      <IconPrinter size={20} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Compartir anexo" withinPortal>
                    <ActionIcon
                      size={28}
                      p={2}
                      aria-label="Compartir anexo"
                      variant="light"
                      disabled={
                        historicalOnly ||
                        editing ||
                        busy ||
                        printing ||
                        !result ||
                        dirty
                      }
                      onClick={async () => {
                        if (!result) return;
                        stopRefresh.current?.();
                        setBusy(true);
                        setError(null);
                        try {
                          const current = await consult();
                          setSendData({
                            input: current.input,
                            result: current.result,
                            revision: current.revision,
                            issues: current.sourceIssues,
                            customer:
                              customers.find((c) => c.id === customer)?.name ??
                              "Cliente",
                            worksite:
                              sites.find((s) => s.id === site)?.alias ||
                              sites.find((s) => s.id === site)?.worksite.name ||
                              "Obra",
                          });
                        } catch (error) {
                          setError(
                            error instanceof Error
                              ? error.message
                              : "No se pudo actualizar el anexo para compartir",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <svg
                        width={20}
                        height={20}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M8 10H5v11h14V10h-3M12 15V2m-4 4 4-4 4 4" />
                      </svg>
                    </ActionIcon>
                  </Tooltip>
                </Group>
              }
              onChange={edit}
              onModeChange={changeBillingMode}
              onConfigureCalendar={() => setCalendarOpened(true)}
              onReport={(i) => {
                setReportIndex(i);
                setReport(structuredClone(input.machineDays[i]));
              }}
            />
            {extrasSupported ? (
              <>
                <AnnexTransport
                  input={input}
                  editing={editing}
                  busy={busy}
                  onChange={edit}
                />
                <Textarea
                  label="Observaciones"
                  description="Este texto aparecerá en la impresión y en el PDF del anexo."
                  placeholder="Escribe las observaciones del anexo"
                  autosize
                  minRows={3}
                  maxRows={10}
                  maxLength={5000}
                  value={input.observations ?? ""}
                  readOnly={!editing}
                  disabled={busy}
                  onChange={(event) =>
                    edit({ ...input, observations: event.currentTarget.value })
                  }
                />
              </>
            ) : null}
            {previewError ? (
              <Alert color="red">
                No se pudo recalcular: {previewError}
                {editing &&
                input.rentals.some((r) => r.dayAdjustments?.length) ? (
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    mt="xs"
                    disabled={busy}
                    onClick={() =>
                      edit({
                        ...input,
                        rentals: input.rentals.map((r) => ({
                          ...r,
                          dayAdjustments: [],
                        })),
                      })
                    }
                  >
                    Restablecer días automáticos
                  </Button>
                ) : null}
              </Alert>
            ) : null}
            <Modal
              classNames={{ content: glassStyles.theme }}
              opened={calendarOpened}
              onClose={() => setCalendarOpened(false)}
              title="Conf. domingos y festivos"
              size="lg"
            >
              <fieldset
                disabled={!editing || busy}
                style={{ border: 0, padding: 0, margin: 0 }}
              >
                <Paper withBorder p="md">
                  <Stack>
                    <Text size="sm" fw={600}>
                      Calendario y reglas de cobro del anexo
                    </Text>
                    <Text size="sm">
                      Las reglas y excepciones se conservan al guardar. Para
                      incorporar movimientos nuevos, guarda esta revisión,
                      cambia «Fin del corte» y actualiza los movimientos. Se
                      conservan reportes y descuentos.
                    </Text>
                    <Group>
                      {[
                        [0, "Excluir domingos"],
                        [6, "Excluir sábados"],
                      ].map(([day, label]) => (
                        <Checkbox
                          key={day}
                          label={label}
                          checked={input.policy.excludedWeekdays.includes(
                            Number(day),
                          )}
                          disabled={busy}
                          onChange={(e) =>
                            edit({
                              ...input,
                              policy: {
                                ...input.policy,
                                excludedWeekdays: e.currentTarget.checked
                                  ? [
                                      ...input.policy.excludedWeekdays,
                                      Number(day),
                                    ]
                                  : input.policy.excludedWeekdays.filter(
                                      (d) => d !== day,
                                    ),
                              },
                            })
                          }
                        />
                      ))}
                    </Group>
                    <Checkbox
                      label="Cobrar también el día de devolución"
                      checked={input.policy.includeReturnDay}
                      disabled={busy}
                      onChange={(e) =>
                        edit({
                          ...input,
                          policy: {
                            ...input.policy,
                            includeReturnDay: e.currentTarget.checked,
                          },
                        })
                      }
                    />
                    <TextInput
                      label="Festivos del corte"
                      description="Fechas AAAA-MM-DD separadas por coma. Confirma el calendario incluso si no hay festivos."
                      defaultValue={input.policy.holidays.join(", ")}
                      key={`${site}-${revision}`}
                      disabled={busy}
                      onBlur={(e) => {
                        const dates = e.currentTarget.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        if (dates.join() !== input.policy.holidays.join())
                          edit({
                            ...input,
                            policy: {
                              ...input.policy,
                              holidays: dates,
                              holidayCalendarConfirmed: false,
                            },
                          });
                      }}
                    />
                    <Group>
                      <Checkbox
                        label="Excluir festivos del alquiler diario"
                        checked={input.policy.excludeHolidays}
                        disabled={busy}
                        onChange={(e) =>
                          edit({
                            ...input,
                            policy: {
                              ...input.policy,
                              excludeHolidays: e.currentTarget.checked,
                            },
                          })
                        }
                      />
                      <Checkbox
                        label="Calendario de festivos revisado"
                        checked={input.policy.holidayCalendarConfirmed}
                        disabled={busy}
                        onChange={(e) =>
                          edit({
                            ...input,
                            policy: {
                              ...input.policy,
                              holidayCalendarConfirmed: e.currentTarget.checked,
                            },
                          })
                        }
                      />
                    </Group>
                  </Stack>
                </Paper>
              </fieldset>
            </Modal>
            {issues.length ? (
              <Stack gap="xs">
                <Tooltip
                  label={
                    reviewOpened
                      ? "Ocultar avisos"
                      : "Ver avisos antes de facturar"
                  }
                >
                  <ActionIcon
                    color="yellow"
                    variant="light"
                    aria-label={
                      reviewOpened
                        ? "Ocultar avisos"
                        : "Ver avisos antes de facturar"
                    }
                    aria-expanded={reviewOpened}
                    aria-controls="annex-review-notices"
                    onClick={() => setReviewOpened((opened) => !opened)}
                  >
                    <IconAlertTriangle size={18} />
                  </ActionIcon>
                </Tooltip>
                <Collapse in={reviewOpened}>
                  <div id="annex-review-notices">
                    <Alert color="yellow" title="Antes de facturar">
                      <Stack gap="sm">
                        {annexReviewNotices(issues, input).map((notice) => (
                          <div key={notice.message}>
                            <Text size="sm">{notice.message}</Text>
                            {notice.equipment.length ? (
                              <details style={{ marginTop: 4, fontSize: 13 }}>
                                <summary style={{ cursor: "pointer" }}>
                                  Ver equipos afectados (
                                  {notice.equipment.length})
                                </summary>
                                <Text size="sm" mt={4}>
                                  {notice.equipment.join(" · ")}
                                </Text>
                              </details>
                            ) : null}
                          </div>
                        ))}
                      </Stack>
                    </Alert>
                  </div>
                </Collapse>
              </Stack>
            ) : null}
            {result ? (
              <div className={glassStyles.summaryLayout}>
                <div>
                  {result.issues.length ? (
                    <Alert color="yellow">
                      {result.issues.length} pendientes de cálculo o reportes.{" "}
                      {Array.from(
                        new Set(result.issues.map((i) => i.message)),
                      ).join(" · ")}
                    </Alert>
                  ) : null}
                </div>
                <Paper withBorder p="md" className={glassStyles.summary}>
                  <Title order={3} ta="right">
                    Alquiler calculado
                  </Title>
                  <dl className={glassStyles.amounts}>
                    <div>
                      <dt>Valor base</dt>
                      <dd>{money(taxTotals!.base)}</dd>
                    </div>
                    <div>
                      <dt>Descuentos y exenciones</dt>
                      <dd>− {money(result.totals.rentalDiscount)}</dd>
                    </div>
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(taxTotals!.subtotal)}</dd>
                    </div>
                    <div>
                      <dt>
                        <Switch
                          label={`IVA (${vatPercent} %)`}
                          aria-label="Aplicar IVA del 19 %"
                          checked={vatPercent === 19}
                          disabled={!editing || busy || historicalOnly}
                          onChange={(event) =>
                            edit({
                              ...input,
                              policy: {
                                ...input.policy,
                                vatPercent: event.currentTarget.checked
                                  ? 19
                                  : 0,
                              },
                            })
                          }
                          size="sm"
                        />
                      </dt>
                      <dd>{money(taxTotals!.vat)}</dd>
                    </div>
                    <div className={glassStyles.grandTotal}>
                      <dt>Total a pagar</dt>
                      <dd>{money(taxTotals!.total)}</dd>
                    </div>
                  </dl>
                </Paper>
              </div>
            ) : null}
          </>
        ) : null}
        <Modal
          opened={saveOpened}
          onClose={() => {
            if (!busy) setSaveOpened(false);
          }}
          title="Guardar anexo"
          classNames={{ content: glassStyles.theme }}
          closeOnClickOutside={!busy}
          closeOnEscape={!busy}
          withCloseButton={!busy}
        >
          <Stack>
            <Text size="sm">
              El anexo quedará guardado en la carpeta del cliente y la obra
              seleccionados.
            </Text>
            <Checkbox
              label="Marcar como facturado"
              checked={markInvoiced}
              disabled={busy}
              onChange={(event) => setMarkInvoiced(event.currentTarget.checked)}
            />
            {markInvoiced && (
              <TextInput
                label="Número de factura"
                placeholder="Ej. FE-3862"
                description="Ingresa manualmente la factura asociada a este anexo."
                value={invoiceTag}
                maxLength={80}
                autoCapitalize="characters"
                styles={{ input: { textTransform: "uppercase" } }}
                disabled={busy}
                onChange={(event) =>
                  setInvoiceTag(
                    event.currentTarget.value.toLocaleUpperCase("es-CO"),
                  )
                }
              />
            )}
            {markInvoiced && (
              <Text size="sm" c="dimmed">
                Al abrirlo se mostrará esta versión guardada, sin recalcular sus
                valores.
              </Text>
            )}
            {error && <Alert color="red">{error}</Alert>}
            <Group justify="end">
              <Button
                variant="default"
                disabled={busy}
                onClick={() => setSaveOpened(false)}
              >
                Cancelar
              </Button>
              <Button
                loading={busy}
                disabled={markInvoiced && !invoiceTag.trim()}
                onClick={() =>
                  calculate(
                    true,
                    markInvoiced
                      ? invoiceTag.trim().toLocaleUpperCase("es-CO")
                      : null,
                  )
                }
              >
                Guardar anexo
              </Button>
            </Group>
          </Stack>
        </Modal>
        <AnnexSend
          data={sendData}
          customerWorksiteId={site}
          onClose={() => setSendData(null)}
        />
        <Modal
          classNames={{ content: glassStyles.theme }}
          opened={report !== null}
          onClose={() => setReport(null)}
          title={report ? `${report.label} · ${report.date}` : ""}
          size="lg"
        >
          {report && input ? (
            <fieldset
              disabled={!editing || busy}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <Stack>
                <Select
                  label="Estado del día"
                  value={report.status}
                  data={[
                    { value: "PENDING", label: "Pendiente de confirmar" },
                    { value: "NO_WORK", label: "No hubo trabajo" },
                    { value: "REPORTED", label: "Hay reporte" },
                  ]}
                  onChange={(v) =>
                    setReport({
                      ...report,
                      status: v as MachineDay["status"],
                      reports: v === "REPORTED" ? report.reports : [],
                      waiverReason:
                        v === "REPORTED" ? report.waiverReason : undefined,
                    })
                  }
                />
                {report.status === "NO_WORK" ? (
                  <Textarea
                    label="Confirmación / motivo"
                    value={report.confirmationReason ?? ""}
                    onChange={(e) =>
                      setReport({
                        ...report,
                        confirmationReason: e.currentTarget.value,
                      })
                    }
                  />
                ) : null}
                {report.status === "REPORTED" ? (
                  <>
                    {report.reports.map((r, n) => (
                      <Paper key={n} withBorder p="sm">
                        <Stack>
                          <TextInput
                            label="Número del reporte físico"
                            value={r.source.reference}
                            onChange={(e) => {
                              const rows = [...report.reports];
                              rows[n] = {
                                ...r,
                                source: {
                                  ...r.source,
                                  reference: e.currentTarget.value,
                                },
                              };
                              setReport({ ...report, reports: rows });
                            }}
                          />
                          <Select
                            searchable
                            label="Operario"
                            value={r.employeeId}
                            data={employees.map((e) => ({
                              value: e.id,
                              label: `${e.name} ${e.lastName}`,
                            }))}
                            onChange={(v) => {
                              const rows = [...report.reports];
                              rows[n] = { ...r, employeeId: v ?? "" };
                              setReport({ ...report, reports: rows });
                            }}
                          />
                          <TextInput
                            label="Horas reportadas"
                            inputMode="decimal"
                            value={r.hours}
                            onChange={(e) => {
                              const rows = [...report.reports];
                              rows[n] = { ...r, hours: e.currentTarget.value };
                              setReport({ ...report, reports: rows });
                            }}
                          />
                          <Button
                            color="red"
                            variant="subtle"
                            onClick={() =>
                              setReport({
                                ...report,
                                reports: report.reports.filter(
                                  (_, i) => i !== n,
                                ),
                              })
                            }
                          >
                            Quitar reporte
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                    <Button
                      variant="light"
                      onClick={() =>
                        setReport({
                          ...report,
                          reports: [
                            ...report.reports,
                            {
                              source: { reference: "", origin: "PHYSICAL" },
                              employeeId: "",
                              hours: "",
                            },
                          ],
                        })
                      }
                    >
                      Añadir reporte físico
                    </Button>
                  </>
                ) : null}
                {editing ? (
                  <Button
                    onClick={() => {
                      if (reportIndex === null) return;
                      const days = [...input.machineDays];
                      days[reportIndex] = report;
                      edit({ ...input, machineDays: days });
                      setReport(null);
                    }}
                  >
                    Aplicar cambios
                  </Button>
                ) : null}
              </Stack>
            </fieldset>
          ) : null}
        </Modal>
      </Stack>
    </Container>
  );
}
