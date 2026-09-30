import type { AnnexInput, Result } from "../app/billing/annexes/types";

export type SheetRow = {
  id: string;
  group?: boolean;
  assetId?: string;
  skuId?: string;
  supplement?: boolean;
  included?: boolean;
  composition?: string;
  rentalId?: string;
  kind: "rentals" | "machineDays";
  index: number;
  label: string;
  reference: string;
  mode: string;
  from: string;
  to: string;
  quantity: string;
  days: string;
  hours: string;
  units: string;
  basePrice: string;
  discountPercent: string;
  effectivePrice: string;
  adjustmentReason: string;
  net: string;
  status: string;
};
export const editableKeys = [
  "discountPercent",
  "effectivePrice",
  "days",
] as const;
export type SheetChange = { row: SheetRow; key: string; value: string };
const cents = (value: string) => BigInt(value.replace(".", ""));
const amount = (value: bigint) =>
  `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;

// Group only consecutive server-calculated days with the same charge conditions.
export function sheetRows(
  input: AnnexInput,
  result: Result | null,
): SheetRow[] {
  const linesBySource = new Map<string, Result["lines"]>();
  for (const line of result?.lines ?? []) {
    const id = line.key.slice(0, -11).replace(/:minimum$/, "");
    const key = `${line.kind}:${id}`;
    const lines = linesBySource.get(key) ?? [];
    lines.push(line);
    linesBySource.set(key, lines);
  }
  return (["rentals", "machineDays"] as const).flatMap((kind) =>
    input[kind].flatMap((source, index) => {
      const rental = kind === "rentals" ? input.rentals[index] : null;
      const day = kind === "machineDays" ? input.machineDays[index] : null;
      const lines = (
        linesBySource.get(
          `${rental ? ((rental.metering ?? rental.cutting) ? "METER" : "DAY") : "HOUR"}:${rental?.id ?? day!.assetId}`,
        ) ?? []
      )
        .filter((l) => !day || l.date === day.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      const groups: Result["lines"][] = [];
      const adjustmentFor = (date: string) =>
        rental?.dayAdjustments?.find((a) => date >= a.from && date <= a.to);
      for (const line of lines) {
        const group = groups[groups.length - 1],
          previous = group?.[group.length - 1];
        if (
          rental &&
          !(rental.metering ?? rental.cutting) &&
          previous &&
          Date.parse(line.date) - Date.parse(previous.date) === 86400000 &&
          line.quantity === previous.quantity &&
          adjustmentFor(line.date) === adjustmentFor(previous.date) &&
          (adjustmentFor(line.date) || line.net === previous.net) &&
          line.reason === previous.reason &&
          line.waived === previous.waived
        )
          group.push(line);
        else groups.push([line]);
      }
      if (!groups.length) groups.push([]);
      return groups.map((group) => {
        const first = group[0];
        return {
          id: `${kind}:${rental?.id ?? `${day!.assetId}:${day!.date}`}:${first?.key ?? "pending"}`,
          kind,
          index,
          skuId: rental?.skuId,
          rentalId: rental?.id,
          included: Boolean(source.includedIn),
          composition: source.includedIn
            ? `Incluido en ${source.includedIn.label}`
            : source.commercial?.parts
                .map(
                  (p) =>
                    `${p.quantity} × ${p.label} · ${p.treatment === "INCLUDED" ? "Incluido" : p.treatment === "INDEPENDENT" ? "Cobro independiente" : "Por revisar"}`,
                )
                .join("\n"),
          supplement: first?.key.includes(":minimum:") ?? false,
          label: source.label,
          reference:
            rental?.source.reference ??
            day!.reports.map((r) => r.source.reference).join(", "),
          mode: source.includedIn
            ? "Incluido"
            : rental
              ? (rental.metering ?? rental.cutting)
                ? "M"
                : "D"
              : "HR",
          from: first?.date ?? day?.date ?? rental!.deliveredOn,
          to: group.at(-1)?.date ?? day?.date ?? input.period.through,
          quantity: first?.quantity ?? (rental ? "—" : "1"),
          days:
            (rental?.metering ?? rental?.cutting)
              ? "—"
              : first
                ? String(
                    rental
                      ? group.reduce(
                          (sum, line) => sum + Number(line.billableUnits ?? 1),
                          0,
                        )
                      : group.length,
                  )
                : "—",
          hours: first?.reportedHours ?? "—",
          units:
            rental && !(rental.metering ?? rental.cutting)
              ? "—"
              : (first?.billableUnits ?? "—"),
          basePrice: (
            (rental?.metering ?? rental?.cutting)?.pricing ?? source.pricing
          ).basePrice,
          discountPercent:
            ((rental?.metering ?? rental?.cutting)?.pricing ?? source.pricing)
              .discountPercent ??
            first?.discountPercent ??
            "0",
          effectivePrice:
            ((rental?.metering ?? rental?.cutting)?.pricing ?? source.pricing)
              .effectivePrice ??
            first?.effectivePrice ??
            "",
          adjustmentReason: source.pricing.adjustmentReason ?? "",
          net: first
            ? amount(group.reduce((sum, l) => sum + cents(l.net), 0n))
            : "",
          status: source.includedIn
            ? "Incluido"
            : source.commercial?.status === "REVIEW"
              ? "Revisar modalidad"
              : !result
                ? "Por calcular"
                : day?.status === "PENDING"
                  ? "Falta reporte"
                  : day?.status === "NO_WORK"
                    ? "Sin trabajo confirmado"
                    : first?.waived
                      ? "Exento"
                      : first
                        ? "Calculado"
                        : "Sin días cobrables",
        };
      });
    }),
  );
}

// Apply a paste atomically. Prices belong to the source lot, not just a visible segment.
export function applySheetChanges(
  input: AnnexInput,
  changes: SheetChange[],
  reason = "",
): AnnexInput {
  const next = structuredClone(input);
  const seen = new Map<string, string>();
  for (const { row, key, value } of changes) {
    if (row.included || row.status === "Revisar modalidad")
      throw new Error("Esta fila no tiene un cobro independiente editable.");
    if (row.group)
      throw new Error("Selecciona una fila de día, no el título del equipo.");
    if (!(editableKeys as readonly string[]).includes(key))
      throw new Error(
        "Esa columna está protegida. Solo puedes editar días de alquiler, descuento y precio acordado.",
      );
    const original = next[row.kind][row.index];
    const source =
      row.kind === "rentals" &&
      (next.rentals[row.index]?.metering ?? next.rentals[row.index]?.cutting)
        ? (next.rentals[row.index].metering ?? next.rentals[row.index].cutting)!
        : original;
    if (!source) throw new Error("La fila cambió. Selecciónala nuevamente.");
    const normalized = value.trim().replace(",", ".") || "0";
    if (key === "days") {
      if (
        row.kind !== "rentals" ||
        row.mode !== "D" ||
        row.supplement ||
        row.status !== "Calculado"
      )
        throw new Error(
          "Los días se ajustan en filas de alquiler por día ya calculadas y sin exención.",
        );
      if (!/^\d{1,3}$/.test(normalized))
        throw new Error("Los días deben ser un número entero entre 0 y 999.");
      const lot = next.rentals[row.index];
      const adjustments = lot.dayAdjustments ?? [];
      if (
        adjustments.some(
          (a) =>
            a.from <= row.to &&
            a.to >= row.from &&
            (a.from !== row.from || a.to !== row.to),
        )
      )
        throw new Error(
          "El tramo cambió. Revisa el ajuste de días antes de continuar.",
        );
      const identity = `days:${row.index}:${row.from}:${row.to}`;
      if (seen.has(identity) && seen.get(identity) !== normalized)
        throw new Error("Aplica un único número de días al mismo tramo.");
      seen.set(identity, normalized);
      lot.dayAdjustments = adjustments.filter(
        (a) => a.from !== row.from || a.to !== row.to,
      );
      const calendarDays =
        (Date.parse(row.to) - Date.parse(row.from)) / 86400000 + 1;
      if (Number(normalized) !== calendarDays)
        lot.dayAdjustments.push({
          from: row.from,
          to: row.to,
          days: Number(normalized),
          quantity: row.quantity,
        });
      continue;
    }
    const identity = `${row.kind}:${row.index}`;
    const previous = seen.get(identity);
    // Every editable column in this sheet is numeric: an empty committed cell is zero.
    const signature = `${key}:${normalized}`;
    if (previous && previous !== signature)
      throw new Error(
        "Un mismo lote aparece en varios tramos. Aplica un único ajuste al lote.",
      );
    seen.set(identity, signature);
    const valid =
      key === "effectivePrice"
        ? /^\d{1,10}(\.\d{1,2})?$/
        : /^\d{1,3}(\.\d{1,6})?$/;
    if (!valid.test(normalized))
      throw new Error(
        "Usa un número sin separadores de miles ni fórmulas. Precio: hasta 2 decimales; descuento: hasta 6.",
      );
    if (
      Number(normalized) >
      (key === "discountPercent" ? 100 : Number(source.pricing.basePrice))
    )
      throw new Error(
        "El descuento debe estar entre 0 y 100; el precio acordado no puede superar el precio base.",
      );
    const adjustmentReason = reason.trim() || source.pricing.adjustmentReason;
    const { basePrice } = source.pricing;
    source.pricing = {
      basePrice,
      ...(adjustmentReason ? { adjustmentReason } : {}),
      [key]: normalized,
    };
  }
  return next;
}

// Asset identity keeps distinct machines separate even when they share a label.
export function groupMachineRows(
  input: AnnexInput,
  rows: SheetRow[],
): SheetRow[] {
  const groups = new Map<string, SheetRow[]>();
  const daily = rows.filter((row) => row.kind === "rentals");
  for (const row of rows) {
    if (row.kind !== "machineDays") continue;
    const assetId = input.machineDays[row.index].assetId;
    const days = groups.get(assetId) ?? [];
    days.push({ ...row, assetId });
    groups.set(assetId, days);
  }
  return [
    ...(input.policy?.minimumDaysBySku
      ? [
          ...daily
            .reduce((map, row) => {
              const key =
                input.rentals[row.index].commercial ||
                input.rentals[row.index].metering ||
                input.rentals[row.index].cutting
                  ? String(row.index)
                  : (row.skuId ?? row.id);
              const children = map.get(key) ?? [];
              children.push(row);
              map.set(key, children);
              return map;
            }, new Map<string, SheetRow[]>())
            .entries(),
        ].flatMap(([key, children]) => [
          { ...children[0], id: `rental-group:${key}`, group: true },
          ...children,
        ])
      : daily),
    ...[...groups].flatMap(([assetId, days]) => {
      days.sort((a, b) => a.from.localeCompare(b.from));
      const first = days[0];
      return [
        { ...first, id: `machine-group:${assetId}`, group: true, assetId },
        ...days,
      ];
    }),
  ];
}
