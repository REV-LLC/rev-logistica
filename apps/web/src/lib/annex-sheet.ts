import type { AnnexInput, Rental, Result, Source } from "../app/billing/annexes/types";

export type SheetRow = {
  // null denotes stock carried into the cut. Sources identify the change starting this balance.
  movementSources?: Source[] | null;
  manualType?: "REPAIR" | "REPLACEMENT";
  id: string;
  members?: SheetRow[];
  group?: boolean;
  assetId?: string;
  accessoryId?: string;
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
  areaM2?: string;
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
function bulkBalanceKey(input: AnnexInput, rental: Rental) {
  if (!rental.skuId || rental.assetId || rental.accessoryId || rental.commercial ||
      rental.includedIn || rental.metering || rental.cutting || rental.commercialInterval) return null;
  const pricing = rental.pricing;
  return JSON.stringify([rental.skuId, rental.label, rental.billingAreaM2, pricing.basePrice,
    pricing.effectivePrice, pricing.discountPercent ?? "0", pricing.adjustmentReason,
    input.policy?.minimumDaysByRental?.[rental.id] ?? input.policy?.minimumDaysBySku?.[rental.skuId] ?? 0]);
}

type BalanceChange = { date: string; sources: Source[]; hasReturn: boolean };

// The engine already priced each lot-day. These dates only partition the display of those lines.
function balanceChanges(input: AnnexInput) {
  const groups = new Map<string, Map<string, BalanceChange>>();
  const byLot = input.rentals.map((rental) => {
    const key = bulkBalanceKey(input, rental) ?? rental.id;
    const dates = groups.get(key) ?? new Map<string, BalanceChange>();
    groups.set(key, dates);
    const add = (date: string, source: Source, isReturn = false) => {
      if (date < input.period.from || date > input.period.through || date > input.period.to) return;
      const change = dates.get(date) ?? {date, sources: [], hasReturn: false};
      change.sources.push(source);
      change.hasReturn ||= isReturn;
      dates.set(date, change);
    };
    const start = rental.billingStartsOn ?? rental.deliveredOn;
    const sameDayReturns = start > rental.deliveredOn
      ? rental.returns.filter(event => (event.billingCutoffDate ?? event.date) === rental.deliveredOn)
      : [];
    if (sameDayReturns.length) add(rental.deliveredOn, rental.source);
    if ((rental.deliveredOn >= input.period.from || start > input.period.from) &&
        (!sameDayReturns.length || sumQuantities(sameDayReturns.map(event => event.quantity)) !== sumQuantities([rental.quantity]))) {
      add(start, rental.source);
    }
    for (const event of rental.returns) {
      const cutoff = event.billingCutoffDate ?? event.date;
      if (cutoff < input.period.from) continue;
      const includesReturnDay = !event.loss && (event.billingCutoffDate || input.policy?.includeReturnDay || cutoff === rental.deliveredOn);
      const effective = includesReturnDay
        ? new Date(Date.parse(cutoff) + 86400000).toISOString().slice(0, 10) : cutoff;
      add(effective, event.source, true);
    }
    return key;
  });
  const timelines = new Map([...groups].map(([key, dates]) =>
    [key, [...dates.values()].sort((a, b) => b.date.localeCompare(a.date))] as const));
  return byLot.map((key) => timelines.get(key)!);
}

export function sheetDocuments(input: AnnexInput, row: SheetRow) {
  const sources = row.kind === "machineDays"
    ? input.machineDays[row.index].reports.map((report) => report.source)
    : row.movementSources ?? [];
  const documents = new Map<string, { id: string; label: string }>();
  for (const source of sources) {
    if (source.documentId) documents.set(source.documentId, {
      id: source.documentId,
      label: source.documentNumber || "Ver documento",
    });
  }
  return [...documents.values()];
}

export const editableKeys = [
  "discountPercent",
  "effectivePrice",
  "days",
] as const;
export type SheetChange = { row: SheetRow; key: string; value: string };
const cents = (value: string) => BigInt(value.replace(".", ""));
const amount = (value: bigint) =>
  `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;

export function sheetModeOptions(input: AnnexInput, row: SheetRow) {
  const source = input[row.kind][row.index];
  const snapshot = source.commercial;
  if (source.includedIn || snapshot?.contextualZero) return [];
  return (snapshot?.frozenProfile?.modes ?? []).map((mode) => ({
    value: mode.id,
    label: { DAY: "D", HOUR: "HR", METER: "M" }[mode.unit],
    name: mode.name,
    disabled:
      mode.pricing.source === "CATALOG" &&
      (snapshot?.catalog?.unit !== mode.unit ||
        snapshot?.catalog?.price == null),
  }));
}
function commercialLabel(
  source: AnnexInput["rentals"][number] | AnnexInput["machineDays"][number],
) {
  const snapshot = source.commercial;
  if (!snapshot?.frozenProfile?.groups.length || snapshot.contextualZero)
    return source.label;
  const parts = snapshot.parts
    .map((part) => `${part.quantity} × ${part.label}`)
    .join(", ");
  return `${source.label} · ${parts ? `con ${parts}` : "sin accesorios"}`;
}

// Group only consecutive server-calculated days with the same charge conditions.
export function sheetRows(
  input: AnnexInput,
  result: Result | null,
): SheetRow[] {
  const timelines = balanceChanges(input);
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
      const movementOn = (date: string) => timelines[index]?.find((change) => change.date <= date);
      const sourcesOn = (date: string): Source[] | null => {
        if (!rental) return null;
        const change = movementOn(date);
        // On the first day, prior stock and each new delivery retain their own origins.
        if (change && (change.date > input.period.from || change.hasReturn)) return change.sources;
        if (rental.deliveredOn < input.period.from &&
            (rental.billingStartsOn ?? rental.deliveredOn) <= input.period.from &&
            (!rental.commercialInterval || rental.commercialInterval.from <= input.period.from)) return null;
        return [rental.source];
      };
      for (const line of lines) {
        const group = groups[groups.length - 1],
          previous = group?.[group.length - 1];
        if (
          rental &&
          !(rental.metering ?? rental.cutting) &&
          previous &&
          !line.key.includes(":minimum:") && !previous.key.includes(":minimum:") &&
          Date.parse(line.date) - Date.parse(previous.date) === 86400000 &&
          (adjustmentFor(line.date) || movementOn(line.date) === movementOn(previous.date)) &&
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
        const supplement = first?.key.includes(":minimum:") ?? false;
        const movementSources = supplement && rental
          ? rental.returns.filter((event) => (event.billingCutoffDate ?? event.date) === first.date).map((event) => event.source)
          : sourcesOn(first?.date ?? rental?.commercialInterval?.from ?? rental?.billingStartsOn ?? rental?.deliveredOn ?? input.period.from);
        return {
          id: `${kind}:${rental?.id ?? `${day!.assetId}:${day!.date}`}:${first?.key ?? "pending"}`,
          kind,
          index,
          skuId: rental?.skuId,
          assetId: rental?.assetId ?? day?.assetId,
          accessoryId: rental?.accessoryId,
          rentalId: rental?.id ?? day?.rentalId,
          included: Boolean(source.includedIn),
          composition: source.includedIn
            ? `Incluido en ${source.includedIn.label}`
            : source.commercial?.parts
                .map(
                  (p) =>
                    `${p.quantity} × ${p.label} · ${p.treatment === "INCLUDED" ? "Tarifa $0 en este conjunto" : p.treatment === "INDEPENDENT" ? "Tarifa propia" : "Por revisar"}`,
                )
                .join("\n"),
          supplement,
          ...(rental ? { movementSources } : {}),
          label: commercialLabel(source),
          reference:
            rental?.source.reference ??
            day!.reports.map((r) => r.source.reference).join(", "),
          mode: rental?.billingAreaM2 ? "M²/D" : source.includedIn
            ? "Incluido"
            : source.commercial?.mode?.unit
              ? { DAY: "D", HOUR: "HR", METER: "M" }[
                  source.commercial.mode.unit
                ]
              : rental
                ? (rental.metering ?? rental.cutting)
                  ? "M"
                  : "D"
                : "HR",
          from:
            first?.date ??
            day?.date ??
            rental?.commercialInterval?.from ??
            rental!.deliveredOn,
          to:
            group.at(-1)?.date ??
            day?.date ??
            rental?.commercialInterval?.to ??
            input.period.through,
          quantity: first?.quantity ?? (rental ? "—" : "1"),
          areaM2: first?.billableAreaM2,
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
              : source.commercial?.contextualZero
                ? "Tarifa $0 en este conjunto"
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

export function canSetWorksiteRate(rental: Rental) {
  const unit = rental.commercial?.mode?.unit ?? rental.commercial?.catalog?.unit;
  return (!unit || unit === "DAY") && !rental.metering && !rental.cutting &&
    !rental.accessoryId && !rental.includedIn && !rental.commercial?.contextualZero &&
    rental.commercial?.status !== "REVIEW" && rental.commercial?.mode?.pricing.source !== "FIXED";
}

// Apply a paste atomically. Prices belong to the source lot, not just a visible segment.
export function applySheetChanges(
  input: AnnexInput,
  changes: SheetChange[],
  reason = "",
  rememberFinalPrices = false,
): AnnexInput {
  const next = structuredClone(input);
  const seen = new Map<string, string>();
  for (const { row, key, value } of changes.flatMap((change) =>
    (change.row.members ?? [change.row]).map((row) => ({ ...change, row })),
  )) {
    if (row.manualType) throw new Error("Usa Editar en la fila de reparación o reposición.");
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
        !["D", "M²/D"].includes(row.mode) ||
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
    if (key === "discountPercent" && Number(normalized) > 100)
      throw new Error("El descuento debe estar entre 0 y 100.");
    const adjustmentReason = reason.trim() || source.pricing.adjustmentReason;
    const raised = key === "effectivePrice" &&
      Number(normalized) > Number(source.pricing.basePrice);
    const basePrice = raised ? normalized : source.pricing.basePrice;
    // A later discount on an inherited price must keep the same base when
    // this cut is reopened, including when that base exceeds the catalog.
    const inheritedBase = source.pricing.adjustmentSource === "WORKSITE" ? source.pricing.basePrice : undefined;
    const basePriceOverride = raised ? normalized : source.pricing.basePriceOverride ?? inheritedBase;
    source.pricing = {
      basePrice,
      ...(basePriceOverride !== undefined ? { basePriceOverride } : {}),
      adjustmentSource: "MANUAL",
      ...(adjustmentReason ? { adjustmentReason } : {}),
      [key]: normalized,
    };
    if (rememberFinalPrices && row.kind === "rentals") {
      const lot = next.rentals[row.index];
      if (canSetWorksiteRate(lot)) {
        const basis = lot.billingAreaM2 === undefined ? "UNIT" : "AREA_M2";
        if (next.worksiteRates?.some(rate => rate.skuId === lot.skuId && rate.quantityBasis === basis && rate.thisCutOnly)) continue;
        const rates = (next.worksiteRates ?? []).filter(rate => rate.skuId !== lot.skuId || rate.quantityBasis !== basis);
        rates.push({skuId: lot.skuId, quantityBasis: basis, unitPrice: null, tablePrice: { ...lot.pricing }});
        next.worksiteRates = rates;
      }
    }
  }
  return next;
}

function sumQuantities(values: string[]) {
  const precision = Math.max(...values.map(value => value.split(".")[1]?.length ?? 0));
  const scale = 10n ** BigInt(precision);
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(precision, "0") || "0");
  }, 0n);
  const fraction = String(total % scale).padStart(precision, "0").replace(/0+$/, "");
  return fraction ? `${total / scale}.${fraction}` : String(total / scale);
}

// Asset identity keeps distinct machines separate even when they share a label.
// Consolidate presentation only: keep every source row for atomic edits.
function consolidateDailyRows(input: AnnexInput, rows: SheetRow[]): SheetRow[] {
  const groups = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const balanceKey = bulkBalanceKey(input, input.rentals[row.index]);
    const key = balanceKey && !row.supplement && row.status === "Calculado"
      ? JSON.stringify([balanceKey, row.movementSources?.map(s => s.documentId ?? s.reference),
          row.from, row.to, row.days, row.basePrice, row.effectivePrice, row.discountPercent, row.adjustmentReason])
      : row.id;
    const members = groups.get(key);
    if (members) members.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map((members) => {
    const first = members[0];
    if (members.length === 1) return first;
    return {
      ...first, members,
      id: `combined:${members.map((member) => member.id).join("|")}`,
      quantity: sumQuantities(members.map((member) => member.quantity)),
      ...(first.areaM2 !== undefined ? {areaM2: sumQuantities(members.map((member) => member.areaM2!))} : {}),
      net: amount(members.reduce((total, member) => total + cents(member.net), 0n)),
      reference: [...new Set(members.map((member) => member.reference))].join(", "),
    };
  });
}

export function groupMachineRows(
  input: AnnexInput,
  rows: SheetRow[],
  groupDaily = true,
): SheetRow[] {
  const groups = new Map<string, SheetRow[]>();
  const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  const rentalRows = rows.filter((row) => row.kind === "rentals");
  const daily = (groupDaily ? rentalRows : consolidateDailyRows(input, rentalRows))
    .sort((a, b) => byName.compare(a.label, b.label) || a.from.localeCompare(b.from));
  for (const row of rows) {
    if (row.kind !== "machineDays") continue;
    const day = input.machineDays[row.index];
    const assetId = day.assetId;
    const key = day.rentalId ?? assetId;
    const days = groups.get(key) ?? [];
    days.push({ ...row, assetId });
    groups.set(key, days);
  }
  return [
    ...(groupDaily && input.policy?.minimumDaysBySku
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
    ...[...groups].sort((a, b) => byName.compare(a[1][0].label, b[1][0].label)).flatMap(([assetId, days]) => {
      days.sort((a, b) => a.from.localeCompare(b.from));
      const first = days[0];
      return [
        { ...first, id: `machine-group:${assetId}`, group: true },
        ...days,
      ];
    }),
  ];
}

/** One-off charges share the item table but never affect inventory or rental days. */
export function manualSheetRows(input: AnnexInput): SheetRow[] {
  return (input.additionalCharges ?? []).map((charge, index) => {
    const [whole, fraction = ''] = charge.unitPrice.split('.');
    const price = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    return {id: `manual:${charge.id}`, manualType: charge.type, kind: 'rentals', index,
      label: charge.description, reference: charge.type === 'REPAIR' ? 'Reparación' : 'Reposición',
      mode: 'UND', from: '', to: '', quantity: charge.quantity, days: '—', hours: '', units: '',
      basePrice: amount(price), effectivePrice: amount(price), discountPercent: '0',
      adjustmentReason: '', net: amount(price * BigInt(charge.quantity)), status: 'Manual'};
  });
}
