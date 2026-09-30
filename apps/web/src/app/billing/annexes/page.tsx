"use client";
import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
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
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconDeviceFloppy, IconChevronDown } from "@tabler/icons-react";
import AnnexSheet from "./annex-sheet";
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
    to: second
      ? new Date(
          Date.UTC(
            yesterday.getUTCFullYear(),
            yesterday.getUTCMonth() + 1,
            0,
            12,
          ),
        )
          .toISOString()
          .slice(0, 10)
      : `${prefix}15`,
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
  const hasInput = input !== null;
  useEffect(() => {
    setSelectorOpen(!hasInput);
  }, [hasInput]);
  const [issues, setIssues] = useState<SourceIssue[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]);
  const [revision, setRevision] = useState(0),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [sendData, setSendData] = useState<AnnexExport | null>(null);
  const baseline = useRef<{
    input: AnnexInput;
    result: Result | null;
    issues: SourceIssue[];
    period: AnnexInput["period"];
    reason: string;
    dirty: boolean;
  } | null>(null);
  function beginEditing() {
    if (!input || busy) return;
    baseline.current = structuredClone({
      input,
      result,
      issues,
      period,
      reason,
      dirty,
    });
    setEditing(true);
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
  }
  const [calendarOpened, setCalendarOpened] = useState(false);
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
        const available = await api<typeof sites>(
          `/customers/${target.customer}/worksites`,
          { signal: controller.signal },
        );
        if (!available.some((s) => s.id === target.worksite))
          throw new Error(
            "La obra del enlace no pertenece al cliente o no está disponible.",
          );
        const stored = await api<Draft[]>(
          `/annexes/drafts?customerWorksiteId=${target.worksite}`,
          { signal: controller.signal },
        );
        const saved = stored.find(
          (d) =>
            d.periodFrom.slice(0, 10) === target.period.from &&
            d.periodTo.slice(0, 10) === target.period.to,
        );
        const latest = saved?.revisions[0];
        const data =
          latest ??
          (await api<{
            input: AnnexInput;
            result: Result;
            sourceIssues: SourceIssue[];
          }>(
            `/annexes/prepare?${new URLSearchParams({ customerWorksiteId: target.worksite!, ...target.period })}`,
            { signal: controller.signal },
          ));
        if (controller.signal.aborted) return;
        setSites(available);
        setDrafts(stored);
        setInput(data.input);
        setPeriod(data.input.period);
        setResult(data.result);
        setIssues(data.sourceIssues ?? []);
        setRevision(saved?.revision ?? 0);
        setEditing(false);
        setDirty(false);
        setReason("");
        if (latest && latest.input.period.through !== target.period.through)
          setMessage(
            `Se abrió la última versión guardada, con registros hasta ${latest.input.period.through}.`,
          );
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
    });
    if (
      `${window.location.pathname}${window.location.search}${window.location.hash}` !==
      next
    )
      window.history.replaceState(window.history.state, "", next);
  }, [urlReady, editing, busy, customer, site, period, input]);
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
    if (!site) return;
    const controller = new AbortController();
    api<Draft[]>(`/annexes/drafts?customerWorksiteId=${site}`, {
      signal: controller.signal,
    })
      .then((d) => {
        if (!controller.signal.aborted) setDrafts(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [site]);
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
    if (!input || result || busy) return;
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
  }, [input, result, busy]);
  function edit(next: AnnexInput) {
    if (!editing || busy) return;
    setInput(next);
    setResult(null);
    setDirty(true);
    setMessage(null);
  }
  async function prepare(refresh = false) {
    if (!site) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{
        input: AnnexInput;
        result: Result;
        sourceIssues: SourceIssue[];
      }>(
        `/annexes/prepare?${new URLSearchParams({ customerWorksiteId: site, ...period })}`,
      );
      if (refresh && input) {
        const selections = new Map(
          [...input.rentals, ...input.machineDays].flatMap((source) => {
            const id = "id" in source ? source.id : source.rentalId;
            return id && source.commercial?.selectedModeId
              ? [[id, source.commercial.selectedModeId] as const]
              : [];
          }),
        );
        for (const [rentalId, modeId] of selections)
          data.input = await api<AnnexInput>("/annexes/select-mode", {
            method: "POST",
            json: { input: data.input, rentalId, modeId },
          });
        const oldLots = new Map(input.rentals.map((r) => [r.id, r]));
        const oldDays = new Map(
          input.machineDays.map((d) => [`${d.assetId}:${d.date}`, d]),
        );
        const removedLots = input.rentals.filter(
          (r) => !data.input.rentals.some((n) => n.id === r.id),
        );
        const removedDays = input.machineDays.filter(
          (d) =>
            !data.input.machineDays.some(
              (n) => n.assetId === d.assetId && n.date === d.date,
            ),
        );
        if (removedLots.length || removedDays.length) {
          throw new Error(
            "Los movimientos nuevos eliminan líneas existentes. Se conservó el borrador sin cambios; revisa la conciliación antes de regenerarlo.",
          );
        }
        data.input.policy = {
          ...input.policy,
          minimumDaysByRental: {
            ...data.input.policy.minimumDaysByRental,
            ...input.policy.minimumDaysByRental,
          },
          minimumDaysBySku: {
            ...data.input.policy.minimumDaysBySku,
            ...input.policy.minimumDaysBySku,
          },
          minimumHoursByAsset: {
            ...data.input.policy.minimumHoursByAsset,
            ...input.policy.minimumHoursByAsset,
          },
        };
        data.input.rentals = data.input.rentals.map((r) => {
          const old = oldLots.get(r.id);
          return old
            ? {
                ...r,
                pricing: old.pricing,
                waivedDays: old.waivedDays,
                dayAdjustments: old.dayAdjustments,
                modeArchive: old.modeArchive,
                metering: old.metering ?? old.cutting,
              }
            : r;
        });
        data.input.machineDays = data.input.machineDays.map((d) => {
          const old = oldDays.get(`${d.assetId}:${d.date}`);
          return old ? { ...d, ...old, rentalContext: d.rentalContext } : d;
        });
        const refreshedResult = await api<Result>("/annexes/preview", {
          method: "POST",
          json: data.input,
        });
        setInput(data.input);
        setResult(refreshedResult);
        setIssues(data.sourceIssues);
        setDirty(true);
        setReason("Actualización de movimientos y corte de datos");
        setMessage(
          "Se conservaron los ajustes de días, descuentos, excepciones y reportes. Revisa antes de guardar.",
        );
      } else {
        setUrlReady(true);
        setInput(data.input);
        setResult(data.result);
        setIssues(data.sourceIssues);
        setRevision(0);
        setEditing(false);
        setDirty(false);
        setReason("Preparación desde movimientos de inventario");
        setMessage(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar");
    } finally {
      setBusy(false);
    }
  }
  async function calculate(save: boolean) {
    if (!input || !site) return;
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
        setResult(draft.revisions[0].result);
        setDirty(false);
        setEditing(false);
        baseline.current = null;
        setMessage(`Anexo guardado · versión ${draft.revision}`);
        setDrafts((existing) => [
          draft,
          ...existing.filter((d) => d.id !== draft.id),
        ]);
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
    setUrlReady(true);
    setEditing(false);
    baseline.current = null;
    setSendData(null);
    setInput(null);
    setResult(null);
    setIssues([]);
    setRevision(0);
    setDirty(false);
    setReason("");
    setMessage(null);
  }
  return (
    <Container fluid py="xs">
      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Title order={1}>Anexos</Title>
            <Text c="dimmed">
              Prepara y revisa el alquiler por cliente y obra.
            </Text>
          </div>
          <Badge color={editing ? "orange" : "blue"}>
            {editing ? "Editando" : "Consulta"}
            {revision ? ` · versión ${revision}` : ""}
          </Badge>
        </Group>
        {error ? (
          <Alert color="red" title="No se pudo completar">
            {error}
          </Alert>
        ) : null}
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
                {period.to.split("-").reverse().join("/")}
              </Text>
              {input ? (
                <Text size="xs" c="dimmed">
                  Registros hasta{" "}
                  {input.period.through.split("-").reverse().join("/")}
                </Text>
              ) : null}
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
                    disabled={busy || input !== null}
                    onChange={(v) => {
                      setCustomer(v);
                      setSites([]);
                      setSite(null);
                      setDrafts([]);
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
                    disabled={busy || !customer || input !== null}
                    onChange={(v) => {
                      setSite(v);
                      setDrafts([]);
                    }}
                  />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  {(["from", "to", "through"] as const).map((key) => (
                    <TextInput
                      key={key}
                      type="date"
                      label={
                        {
                          from: "Inicio del corte",
                          to: "Fin del corte",
                          through: "Registros hasta",
                        }[key]
                      }
                      value={period[key]}
                      disabled={
                        busy ||
                        (input !== null &&
                          (!editing || key !== "through" || dirty))
                      }
                      onChange={(e) =>
                        setPeriod({ ...period, [key]: e.currentTarget.value })
                      }
                    />
                  ))}
                </SimpleGrid>
                <Group>
                  {input ? (
                    <Button
                      variant="light"
                      disabled={
                        busy ||
                        !editing ||
                        dirty ||
                        revision === 0 ||
                        period.through === input.period.through
                      }
                      onClick={() => prepare(true)}
                    >
                      Actualizar movimientos hasta la fecha elegida
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => prepare()}
                    disabled={!site || input !== null}
                    loading={busy && !input}
                  >
                    Ver anexo desde inventario
                  </Button>
                  {input ? (
                    <Button
                      color="gray"
                      variant="light"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !dirty ||
                          window.confirm(
                            "Se descartarán los cambios sin guardar. ¿Continuar?",
                          )
                        )
                          reset();
                      }}
                    >
                      Cambiar obra / abrir otro anexo
                    </Button>
                  ) : null}
                </Group>
                {!input && drafts.length ? (
                  <Stack gap="xs">
                    <Text fw={600}>Anexos guardados</Text>
                    {drafts.map((d) => (
                      <Button
                        key={d.id}
                        variant="light"
                        disabled={busy}
                        onClick={() => {
                          const r = d.revisions[0];
                          setEditing(false);
                          baseline.current = null;
                          setInput(r.input);
                          setPeriod(r.input.period);
                          setResult(r.result);
                          setIssues(r.sourceIssues ?? []);
                          setRevision(d.revision);
                          setReason("");
                          setDirty(false);
                          setError(null);
                        }}
                      >
                        {d.periodFrom.slice(0, 10)} — {d.periodTo.slice(0, 10)}{" "}
                        · revisión {d.revision}
                      </Button>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </div>
          </Collapse>
        </Paper>
        {input ? (
          <>
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
                          onClick={() => calculate(true)}
                        >
                          <IconDeviceFloppy size={20} />
                        </ActionIcon>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="default"
                        disabled={busy}
                        onClick={cancelEditing}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="xs" disabled={busy} onClick={beginEditing}>
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
                            onClick={() => calculate(true)}
                          >
                            <IconDeviceFloppy size={20} />
                          </ActionIcon>
                        </Tooltip>
                      ) : null}
                    </>
                  )}
                  <Tooltip label="Compartir anexo" withinPortal>
                    <ActionIcon
                      size={28}
                      p={2}
                      aria-label="Compartir anexo"
                      variant="light"
                      disabled={editing || busy || !result || dirty}
                      onClick={() => {
                        if (!result) return;
                        setSendData(
                          structuredClone({
                            input,
                            result,
                            revision,
                            issues,
                            customer:
                              customers.find((c) => c.id === customer)?.name ??
                              "Cliente",
                            worksite:
                              sites.find((s) => s.id === site)?.alias ||
                              sites.find((s) => s.id === site)?.worksite.name ||
                              "Obra",
                          }),
                        );
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
              onConfigureCalendar={() => setCalendarOpened(true)}
              onReport={(i) => {
                setReportIndex(i);
                setReport(structuredClone(input.machineDays[i]));
              }}
            />
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
                      cambia «Registros hasta» y actualiza los movimientos. Se
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
              <Alert color="yellow" title="Fuentes que requieren revisión">
                <Stack gap={4}>
                  {issues.map((i, n) => (
                    <Text size="sm" key={`${i.code}-${n}`}>
                      {i.message} · {i.reference}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : null}
            {result ? (
              <Paper withBorder p="md">
                <Stack>
                  <Title order={3}>
                    Alquiler calculado: {money(result.totals.rentalNet)}
                  </Title>
                  <Text>
                    Base: {money(result.totals.rentalGross)} · descuentos y
                    exenciones: {money(result.totals.rentalDiscount)}
                  </Text>
                  {result.issues.length ? (
                    <Alert color="yellow">
                      {result.issues.length} pendientes de cálculo o reportes.{" "}
                      {Array.from(
                        new Set(result.issues.map((i) => i.message)),
                      ).join(" · ")}
                    </Alert>
                  ) : null}
                </Stack>
              </Paper>
            ) : null}
          </>
        ) : null}
        <AnnexSend data={sendData} onClose={() => setSendData(null)} />
        <Modal
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
