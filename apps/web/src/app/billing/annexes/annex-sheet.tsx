"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconClipboardText,
  IconSettings,
  IconMaximize,
  IconMinimize,
  IconChevronUp,
  IconChevronDown,
} from "@tabler/icons-react";
import DataGrid, { textEditor, type Column } from "react-data-grid";
import {
  Alert,
  Checkbox,
  ActionIcon,
  Button,
  Group,
  Paper,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  applySheetChanges,
  editableKeys,
  sheetRows,
  sheetModeOptions,
  groupMachineRows,
  type SheetChange,
  type SheetRow,
} from "@/lib/annex-sheet";
import type { AnnexInput, Result } from "./types";
import "react-data-grid/lib/styles.css";
import styles from "./annex-sheet.module.css";

function CellText({ text }: { text: string }) {
  return (
    <Tooltip label={text} openDelay={250} multiline maw={360} withinPortal>
      <span className={styles.cellText}>{text}</span>
    </Tooltip>
  );
}

function DaysCell({
  row,
  disabled,
  onCommit,
}: {
  row: SheetRow;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(row.days);
  const submitted = useRef(row.days);
  useEffect(() => {
    setValue(row.days);
    submitted.current = row.days;
  }, [row.days]);
  const commit = (next: string) => {
    const normalized = next.trim() || "0";
    setValue(normalized);
    if (disabled || normalized === submitted.current) return;
    submitted.current = normalized;
    onCommit(normalized);
  };
  const step = (amount: number) =>
    commit(String(Math.max(0, Math.min(999, Number(value || 0) + amount))));
  return (
    <div
      className={styles.daysControl}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        className={styles.daysInput}
        role="spinbutton"
        inputMode="numeric"
        aria-label={`Días cobrados: ${row.label} ${row.from}`}
        aria-valuemin={0}
        aria-valuemax={999}
        aria-valuenow={/^\d{1,3}$/.test(value) ? Number(value) : undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={() => commit(value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setValue(row.days);
            submitted.current = row.days;
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            step(event.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <span className={styles.daysArrows}>
        <button
          type="button"
          disabled={disabled || Number(value) >= 999}
          aria-label={`Aumentar días: ${row.label} ${row.from}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => step(1)}
        >
          <IconChevronUp size={12} aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || Number(value) <= 0}
          aria-label={`Reducir días: ${row.label} ${row.from}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => step(-1)}
        >
          <IconChevronDown size={12} aria-hidden />
        </button>
      </span>
    </div>
  );
}

const money = (v: string) =>
  v
    ? new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
      }).format(Number(v))
    : "—";
export default function AnnexSheet({
  input,
  result,
  busy,
  editing,
  actions,
  onChange,
  onModeChange,
  onReport,
  onConfigureCalendar,
  employees,
  customerName,
  worksiteName,
}: {
  customerName: string;
  worksiteName: string;
  employees: { id: string; name: string; lastName: string }[];
  input: AnnexInput;
  result: Result | null;
  busy: boolean;
  editing: boolean;
  actions: ReactNode;
  onChange: (next: AnnexInput) => void;
  onModeChange: (rentalId: string, modeId: string) => Promise<void>;
  onReport: (index: number) => void;
  onConfigureCalendar: () => void;
}) {
  const [machine, setMachine] = useState<{
    assetId: string;
    label: string;
    kind: SheetRow["kind"];
    index: number;
  } | null>(null);
  const [rememberMinimum, setRememberMinimum] = useState(false);
  const [byMeters, setByMeters] = useState(false);
  const [meterPrice, setMeterPrice] = useState("0");
  const [meterMinimum, setMeterMinimum] = useState("40");
  const [cutReports, setCutReports] = useState<
    NonNullable<AnnexInput["rentals"][number]["metering"]>["reports"]
  >([]);
  const [minimum, setMinimum] = useState("6");
  const [minimumError, setMinimumError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]'))
        setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  const [mode, setMode] = useState<string | null>("all");
  const [changingMode, setChangingMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState(result);
  useEffect(() => {
    if (result) setLastResult(result);
  }, [result]);
  const selected = useRef<{ id: string; key: string } | null>(null);
  const rows = useMemo(
    () =>
      groupMachineRows(
        input,
        sheetRows(input, result ?? lastResult).filter(
          (row) => mode === "all" || row.kind === mode,
        ),
      ),
    [input, result, lastResult, mode],
  );
  const apply = (changes: SheetChange[]) => {
    if (!editing || busy || changingMode || !changes.length) return;
    try {
      onChange(applySheetChanges(input, changes));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const selectMode = async (row: SheetRow, modeId: string | null) => {
    if (!modeId || !row.rentalId || !editing || busy || changingMode) return;
    setChangingMode(true);
    try {
      await onModeChange(row.rentalId, modeId);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setChangingMode(false);
    }
  };
  const employeeNames = new Map(
    employees.map((e) => [e.id, `${e.name} ${e.lastName}`]),
  );
  const columns: Column<SheetRow>[] = [
    {
      key: "label",
      name: "Equipo",
      width: 170,
      frozen: true,
      renderCell: ({ row }: { row: SheetRow }) => <CellText text={row.label} />,
    },
    {
      key: "mode",
      name: "Cobro",
      width: 64,
      renderCell: ({ row }: { row: SheetRow }) => {
        const options = sheetModeOptions(input, row);
        if (!editing || !row.rentalId || options.length < 2 || row.supplement)
          return row.mode;
        return (
          <Select
            aria-label={`Cobro: ${row.label}, ${row.from}`}
            size="xs"
            variant="unstyled"
            data={options}
            value={input[row.kind][row.index].commercial?.mode?.id ?? null}
            placeholder={row.mode}
            allowDeselect={false}
            disabled={busy || changingMode}
            comboboxProps={{ withinPortal: true, width: 320 }}
            styles={{
              input: { fontSize: 12, minHeight: 28, paddingLeft: 3 },
              section: { width: 16 },
            }}
            renderOption={({ option }) => (
              <span>
                {option.label} ·{" "}
                {options.find((m) => m.value === option.value)?.name}
              </span>
            )}
            onClick={(event) => event.stopPropagation()}
            onChange={(value) => void selectMode(row, value)}
          />
        );
      },
    },
    {
      key: "from",
      name: "Desde",
      width: 78,
      renderCell: ({ row }: { row: SheetRow }) => (
        <span title={row.from}>
          {row.from.slice(8)}/{row.from.slice(5, 7)}
        </span>
      ),
    },
    {
      key: "to",
      name: "Hasta",
      width: 78,
      renderCell: ({ row }: { row: SheetRow }) => (
        <span title={row.to}>
          {row.to.slice(8)}/{row.to.slice(5, 7)}
        </span>
      ),
    },
    { key: "quantity", name: "Cant.", width: 55 },
    {
      key: "days",
      name: "Días",
      width: 62,
      cellClass: (row: SheetRow) =>
        editing && row.kind === "rentals" && !row.group
          ? styles.editable
          : undefined,
      renderCell: ({ row }: { row: SheetRow }) =>
        editing &&
        row.kind === "rentals" &&
        !row.supplement &&
        row.mode === "D" &&
        row.days !== "—" &&
        row.status !== "Exento" ? (
          <DaysCell
            row={row}
            disabled={busy || !result}
            onCommit={(value) => apply([{ row, key: "days", value }])}
          />
        ) : (
          row.days
        ),
    },
    {
      key: "hours",
      name: input.rentals.some((r) => r.metering ?? r.cutting)
        ? "H./m rep."
        : "H. rep.",
      width: 65,
    },
    {
      key: "units",
      name: input.rentals.some((r) => r.metering ?? r.cutting)
        ? "H./m cob."
        : "H. cob.",
      width: 78,
    },
    {
      key: "basePrice",
      name: "Precio base 🔒",
      width: 95,
      renderCell: ({ row }: { row: SheetRow }) =>
        row.included ? "Incluido" : money(row.basePrice),
    },
    {
      key: "discountPercent",
      name: "Dto. % ✎",
      width: 95,
      renderCell: ({ row }: { row: SheetRow }) =>
        row.included
          ? "—"
          : !result &&
              input[row.kind][row.index].pricing.discountPercent === undefined
            ? "…"
            : Number(row.discountPercent).toLocaleString("es-CO", {
                maximumFractionDigits: 6,
              }),
    },
    {
      key: "effectivePrice",
      name: "Precio final ✎",
      width: 110,
      renderCell: ({ row }: { row: SheetRow }) =>
        row.included
          ? "—"
          : !result &&
              input[row.kind][row.index].pricing.effectivePrice === undefined
            ? "…"
            : money(row.effectivePrice),
    },
    {
      key: "net",
      name: "Total 🔒",
      width: 110,
      renderCell: ({ row }: { row: SheetRow }) =>
        row.included
          ? "Incluido"
          : row.status === "Revisar modalidad"
            ? "Por revisar"
            : result
              ? money(row.net)
              : "Por calcular",
    },
    {
      key: "actions",
      name: "Acciones",
      width: 110,
      renderCell: ({ row }: { row: SheetRow }) => (
        <Group gap={6} wrap="nowrap">
          {row.kind === "machineDays" ? (
            <Tooltip
              withinPortal
              withArrow
              openDelay={200}
              multiline
              maw={360}
              events={{ hover: true, focus: true, touch: false }}
              label={
                <Stack gap={4} style={{ overflowWrap: "anywhere" }}>
                  <Text size="xs" fw={700}>
                    Documentos referenciados ·{" "}
                    {row.from.split("-").reverse().join("/")}
                  </Text>
                  {input.machineDays[row.index].reports.length ? (
                    input.machineDays[row.index].reports.map(
                      (report, index) => (
                        <div
                          key={`${report.source.origin}:${report.source.reference}:${index}`}
                        >
                          <Text size="xs">
                            {
                              {
                                PHYSICAL: "Reporte físico",
                                DIGITAL: "Reporte digital",
                                INVENTORY: "Inventario",
                              }[report.source.origin]
                            }
                            : {report.source.reference}
                          </Text>
                          <Text size="xs">
                            {employeeNames.get(report.employeeId) ??
                              "Operario no disponible"}{" "}
                            · {report.hours} h
                          </Text>
                        </div>
                      ),
                    )
                  ) : (
                    <Text size="xs">
                      {input.machineDays[row.index].status === "NO_WORK"
                        ? "Sin trabajo confirmado. No hay documentos referenciados."
                        : "Sin documentos referenciados para este día."}
                    </Text>
                  )}
                </Stack>
              }
            >
              <ActionIcon
                size={22}
                p={1}
                variant="filled"
                disabled={busy}
                aria-label={`Registrar / revisar reporte: ${row.label} ${row.from}`}
                onClick={() => onReport(row.index)}
              >
                <IconClipboardText size={18} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Group>
      ),
    },
  ]
    .map((column) =>
      column.key !== "days" &&
      (editableKeys as readonly string[]).includes(column.key)
        ? {
            ...column,
            editable: (row: SheetRow) =>
              editing &&
              !busy &&
              !row.group &&
              !row.included &&
              row.status !== "Revisar modalidad",
            renderEditCell: textEditor,
            cellClass: editing ? styles.editable : undefined,
          }
        : column,
    )
    .map((column) => ({
      ...column,
      colSpan: (args) =>
        args.type === "ROW" && args.row.group && column.key === "mode"
          ? columns.length - 1
          : undefined,
      renderCell: (props) => {
        const { row } = props;
        if (!row.group) {
          if (
            column.key === "label" &&
            (row.kind === "machineDays" || input.policy.minimumDaysBySku)
          )
            return (
              <CellText
                text={
                  row.supplement
                    ? "↳ Ajuste al mínimo del alquiler"
                    : `↳ ${row.from.split("-").reverse().join("/")}${row.to !== row.from ? " – " + row.to.split("-").reverse().join("/") : ""}`
                }
              />
            );
          return column.renderCell
            ? column.renderCell(props)
            : String(row[column.key as keyof SheetRow] ?? "");
        }
        if (column.key === "label")
          return (
            <Group gap={4} wrap="nowrap" className={styles.groupTitle}>
              <Tooltip
                label={row.composition || row.label}
                multiline
                withinPortal
                maw={420}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <CellText text={row.label} />
                </span>
              </Tooltip>
              <Tooltip label="Configurar mínimo de cobro" withinPortal>
                <ActionIcon
                  size={22}
                  p={1}
                  variant="light"
                  disabled={
                    busy ||
                    !editing ||
                    row.included ||
                    row.status === "Revisar modalidad"
                  }
                  aria-label={`Configurar mínimo de cobro: ${row.label}`}
                  onClick={() => {
                    setMachine({
                      assetId: row.assetId ?? row.skuId!,
                      label: row.label,
                      kind: row.kind,
                      index: row.index,
                    });
                    setMinimum(
                      row.kind === "rentals"
                        ? String(
                            input.policy.minimumDaysByRental?.[row.rentalId!] ??
                              input.policy.minimumDaysBySku?.[row.skuId!] ??
                              0,
                          )
                        : (input.policy.minimumHoursByAsset?.[row.assetId!] ??
                            input.policy.minimumHoursPerMachineDay),
                    );
                    const cutting =
                      row.kind === "rentals"
                        ? (input.rentals[row.index].metering ??
                          input.rentals[row.index].cutting)
                        : undefined;
                    setByMeters(Boolean(cutting));
                    setMeterPrice(cutting?.pricing.basePrice ?? "0");
                    setMeterMinimum(cutting?.minimumMeters ?? "0");
                    setCutReports(structuredClone(cutting?.reports ?? []));
                    setRememberMinimum(false);
                    setMinimumError(null);
                  }}
                >
                  <IconSettings size={18} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            </Group>
          );
        if (column.key === "mode")
          return (
            <Text size="xs" fw={600}>
              {row.included
                ? row.composition
                : row.status === "Revisar modalidad"
                  ? "Modalidad pendiente de revisión"
                  : "Mínimo: "}
              {!row.included &&
                row.status !== "Revisar modalidad" &&
                (row.kind === "rentals"
                  ? (input.rentals[row.index].metering ??
                    input.rentals[row.index].cutting)
                    ? `${(input.rentals[row.index].metering ?? input.rentals[row.index].cutting)!.minimumMeters} m por alquiler`
                    : `${input.policy.minimumDaysByRental?.[row.rentalId!] ?? input.policy.minimumDaysBySku?.[row.skuId!] ?? 0} días por alquiler`
                  : `${input.policy.minimumHoursByAsset?.[row.assetId!] ?? input.policy.minimumHoursPerMachineDay} h por día`)}
            </Text>
          );
        return null;
      },
    }));
  const sheet = (
    <Paper
      withBorder
      p="xs"
      className={`${styles.sheet} ${expanded ? styles.expanded : ""}`}
    >
      <Stack gap={6} className={styles.content}>
        <Group justify="space-between">
          <div>
            <Title order={2} style={{ overflowWrap: "anywhere" }}>
              {customerName}
            </Title>
            <Text size="sm" fw={600}>
              {worksiteName}
            </Text>
            <Text size="sm" c="dimmed">
              {input.period.from.split("-").reverse().join("/")} al{" "}
              {input.period.to.split("-").reverse().join("/")}
              {input.period.through !== input.period.to
                ? ` · Registros hasta ${input.period.through.split("-").reverse().join("/")}`
                : ""}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              ALQUILER · SIN IVA NI EXTRAS DEL OPERARIO
            </Text>
            <Text fw={700} size="xl">
              {result ? money(result.totals.rentalNet) : "Por calcular…"}
            </Text>
          </div>
        </Group>
        <Group gap="xs" align="end" className={styles.toolbar}>
          {actions}
          <Button size="xs" variant="light" onClick={onConfigureCalendar}>
            Conf. domingos y festivos
          </Button>

          <Select
            aria-label="Tipo de cobro"
            size="xs"
            w={95}
            value={mode}
            onChange={(v) => {
              setMode(v);
              selected.current = null;
            }}
            allowDeselect={false}
            data={[
              { value: "all", label: "Todos" },
              { value: "rentals", label: "Por día" },
              { value: "machineDays", label: "Por hora" },
            ]}
          />
          <Tooltip
            label={
              expanded ? "Salir de pantalla completa" : "Pantalla completa"
            }
            withinPortal
          >
            <ActionIcon
              size={28}
              p={2}
              variant="light"
              style={{ marginLeft: "auto", flexShrink: 0 }}
              aria-label={
                expanded ? "Salir de pantalla completa" : "Pantalla completa"
              }
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <IconMinimize size={20} />
              ) : (
                <IconMaximize size={20} />
              )}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text size="xs" c="dimmed">
          {editing
            ? "Editando · Celdas azules: doble clic para editar · Guarda los cambios o cancela para descartarlos."
            : "Consulta · Pulsa Editar para modificar valores, reportes o configuración."}
        </Text>
        {error ? (
          <Alert
            color="red"
            role="alert"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        ) : null}
        <div
          className={styles.gridContainer}
          onPasteCapture={(event) => {
            if ((event.target as HTMLElement).closest("input,textarea")) return;
            event.preventDefault();
            event.stopPropagation();
            if (!editing || busy || !selected.current) return;
            const rowIndex = rows.findIndex(
                (r) => r.id === selected.current!.id,
              ),
              colIndex = columns.findIndex(
                (c) => c.key === selected.current!.key,
              );
            if (rowIndex < 0 || colIndex < 0) return;
            const matrix = event.clipboardData
              .getData("text/plain")
              .replace(/\r/g, "")
              .replace(/\n$/, "")
              .split("\n")
              .map((line) => line.split("\t"));
            const changes: SheetChange[] = [];
            for (let y = 0; y < matrix.length; y++)
              for (let x = 0; x < matrix[y].length; x++) {
                const row = rows[rowIndex + y],
                  column = columns[colIndex + x];
                if (!row || !column) {
                  setError(
                    "El bloque pegado excede las filas o columnas visibles. No se aplicó ningún cambio.",
                  );
                  return;
                }
                changes.push({ row, key: column.key, value: matrix[y][x] });
              }
            apply(changes);
          }}
          onCopyCapture={(event) => {
            if (
              (event.target as HTMLElement).closest("input,textarea") ||
              !selected.current
            )
              return;
            const row = rows.find((r) => r.id === selected.current!.id);
            if (!row) return;
            // Never copy an obsolete calculated amount while a preview is pending.
            if (
              !result &&
              [
                "net",
                "effectivePrice",
                "discountPercent",
                "quantity",
                "days",
                "units",
              ].includes(selected.current.key)
            )
              return;
            event.clipboardData.setData(
              "text/plain",
              String(row[selected.current.key as keyof SheetRow] ?? ""),
            );
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <DataGrid
            className={`rdg-light ${styles.grid}`}
            aria-label="Hoja editable del anexo"
            columns={columns}
            rows={rows}
            rowKeyGetter={(row) => row.id}
            defaultColumnOptions={{ resizable: true }}
            rowHeight={(row) => (row.group ? 36 : 30)}
            rowClass={(row) => (row.group ? styles.machineGroup : undefined)}
            headerRowHeight={32}
            onSelectedCellChange={({ row, column }) => {
              selected.current = row ? { id: row.id, key: column.key } : null;
            }}
            onRowsChange={(next, { indexes, column }) =>
              apply(
                indexes
                  .filter(
                    (i) =>
                      next[i][column.key as keyof SheetRow] !==
                      rows[i][column.key as keyof SheetRow],
                  )
                  .map((i) => ({
                    row: rows[i],
                    key: column.key,
                    value: String(next[i][column.key as keyof SheetRow]),
                  })),
              )
            }
            renderers={{
              noRowsFallback: (
                <Text p="md">No hay filas para este filtro.</Text>
              ),
            }}
          />
        </div>
        <Text size="xs" c="dimmed">
          Los días consecutivos con igual cantidad y cobro se agrupan. Los
          totales se recalculan en el servidor y las devoluciones permanecen
          vinculadas al inventario.
        </Text>
      </Stack>
    </Paper>
  );
  return (
    <>
      {expanded ? createPortal(sheet, document.body) : sheet}
      <Modal
        opened={machine !== null}
        onClose={() => setMachine(null)}
        title={`Configuración de cobro · ${machine?.label ?? ""}`}
      >
        <Stack gap="sm">
          <Text size="sm">
            {machine?.kind === "rentals"
              ? "El mínimo de días se completa al devolver la cantidad alquilada y no se repite por quincena. Los metros se completan al devolver el equipo."
              : "Aplica a cada día reportado. Si las horas reportadas superan el mínimo, se cobran las reportadas."}
          </Text>
          {machine && (
            <Text size="sm" fw={600}>
              Modalidad:{" "}
              {input[machine.kind][machine.index].commercial?.mode?.name ??
                (byMeters
                  ? "Por metros"
                  : machine.kind === "rentals"
                    ? "Por días"
                    : "Por horas")}
            </Text>
          )}
          {byMeters ? (
            <>
              <TextInput
                label="Mínimo de metros por alquiler"
                value={meterMinimum}
                onChange={(e) => setMeterMinimum(e.currentTarget.value)}
              />
              <TextInput
                label="Tarifa base por metro (COP)"
                value={meterPrice}
                readOnly
                onChange={(e) => setMeterPrice(e.currentTarget.value)}
                description="Tarifa base guardada en la modalidad comercial. Los descuentos se ajustan en la tabla."
              />
              <Text size="sm" fw={600}>
                Reportes de medición
              </Text>
              {cutReports.map((report, index) => (
                <Group key={index} align="end" gap="xs" wrap="nowrap">
                  <TextInput
                    label="Fecha"
                    type="date"
                    value={report.date}
                    readOnly={report.date < input.period.from}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setCutReports((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, date: value } : r,
                        ),
                      );
                    }}
                  />
                  <TextInput
                    label="Metros"
                    value={report.meters}
                    readOnly={report.date < input.period.from}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setCutReports((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, meters: value } : r,
                        ),
                      );
                    }}
                  />
                  <TextInput
                    label="N.º reporte"
                    value={report.source.reference}
                    readOnly={report.date < input.period.from}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setCutReports((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                source: { ...r.source, reference: value },
                              }
                            : r,
                        ),
                      );
                    }}
                  />
                  <ActionIcon
                    aria-label="Eliminar reporte de medición"
                    disabled={report.date < input.period.from}
                    variant="subtle"
                    onClick={() =>
                      setCutReports((rows) =>
                        rows.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ×
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="light"
                onClick={() =>
                  setCutReports((rows) => [
                    ...rows,
                    {
                      date: input.period.through,
                      meters: "0",
                      source: { reference: "", origin: "PHYSICAL" },
                    },
                  ])
                }
              >
                Agregar reporte de medición
              </Button>
            </>
          ) : (
            <TextInput
              label={
                machine?.kind === "rentals"
                  ? "Mínimo de días por alquiler"
                  : "Mínimo de horas por día"
              }
              inputMode="decimal"
              value={minimum}
              onChange={(event) => setMinimum(event.currentTarget.value)}
              onBlur={() => {
                if (!minimum.trim()) setMinimum("0");
              }}
              description="0 significa sin mínimo."
              error={minimumError}
            />
          )}
          {!byMeters && (
            <Checkbox
              label="Usar también como mínimo de esta obra"
              checked={rememberMinimum}
              onChange={(e) => setRememberMinimum(e.currentTarget.checked)}
              description="Se guarda al guardar el anexo. La siguiente quincena hereda primero el valor del corte anterior."
            />
          )}
          {byMeters && minimumError && (
            <Text c="red" size="sm">
              {minimumError}
            </Text>
          )}
          <Button
            disabled={busy || !editing}
            onClick={() => {
              if (!editing) return;
              const value = minimum.trim().replace(",", ".") || "0";
              if (!machine) return;
              const next = structuredClone(input);
              if (byMeters) {
                const rate = meterPrice.trim().replace(",", ".") || "0";
                const min = meterMinimum.trim().replace(",", ".") || "0";
                if (
                  !/^\d{1,10}(\.\d{1,2})?$/.test(rate) ||
                  !/^\d{1,6}(\.\d{1,6})?$/.test(min) ||
                  cutReports.some(
                    (r) =>
                      !r.source.reference.trim() ||
                      !/^\d{1,10}(\.\d{1,6})?$/.test(
                        r.meters.trim().replace(",", "."),
                      ) ||
                      r.date < next.rentals[machine.index].deliveredOn ||
                      r.date > input.period.through,
                  )
                ) {
                  setMinimumError(
                    "Revisa tarifa, mínimo y reportes: cada reporte necesita fecha, metros y número.",
                  );
                  return;
                }
                const lot = next.rentals[machine.index];
                lot.metering = {
                  minimumMeters: min,
                  pricing: { ...lot.metering?.pricing, basePrice: rate },
                  reports: cutReports.map((r) => ({
                    ...r,
                    meters: r.meters.trim().replace(",", "."),
                    source: {
                      ...r.source,
                      reference: r.source.reference.trim(),
                    },
                  })),
                };
                lot.dayAdjustments = [];
                lot.waivedDays = [];
              } else {
                const daily = machine.kind === "rentals";
                if (
                  !(daily ? /^\d{1,3}$/ : /^\d{1,2}(\.\d{1,6})?$/).test(
                    value,
                  ) ||
                  (!daily && Number(value) > 24)
                ) {
                  setMinimumError(
                    daily
                      ? "Escribe un entero entre 0 y 999 días."
                      : "Escribe un número entre 0 y 24 horas.",
                  );
                  return;
                }
                if (daily) {
                  delete next.rentals[machine.index].metering;
                  next.policy.minimumDaysByRental = {
                    ...next.policy.minimumDaysByRental,
                    [next.rentals[machine.index].id]: Number(value),
                  };
                } else
                  next.policy.minimumHoursByAsset = {
                    ...next.policy.minimumHoursByAsset,
                    [machine.assetId]: value,
                  };
                if (rememberMinimum) {
                  next.policy.rememberMinimums ??= { days: {}, hours: {} };
                  const source = next[machine.kind][machine.index];
                  const target =
                    machine.kind === "rentals"
                      ? (next.rentals[machine.index].assetId ??
                        next.rentals[machine.index].skuId)
                      : machine.assetId;
                  const settingKey = source.commercial?.mode
                    ? `${target}:${source.commercial.mode.id}:${source.commercial.mode.unit}`
                    : machine.assetId;
                  if (daily)
                    next.policy.rememberMinimums.days[settingKey] =
                      Number(value);
                  else next.policy.rememberMinimums.hours[settingKey] = value;
                }
              }
              onChange(next);
              setMachine(null);
            }}
          >
            Aplicar mínimo al equipo
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
