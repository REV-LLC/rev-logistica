import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseAnnexInput } from './annex-input';
import type { AnnexInput } from './annex-input';
const D = Prisma.Decimal;
const DAY = 86400000;
const fail = (message: string): never => {
  throw new BadRequestException(message);
};
function timestamp(date: string) {
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== date
  )
    fail(`Fecha inválida: ${date}`);
  return value;
}
function range(from: string, to: string) {
  const dates: string[] = [];
  for (let time = timestamp(from); time <= timestamp(to); time += DAY)
    dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}
function positive(value: string, label: string) {
  const amount = new D(value);
  if (amount.lte(0)) fail(`${label} debe ser mayor que cero`);
  return amount;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    fail(`${label}: referencia duplicada`);
}
function price(input: AnnexInput['rentals'][number]['pricing']) {
  const base = new D(input.basePrice);
  const discount = new D(input.discountPercent ?? 0);
  if (discount.gt(100)) fail('El descuento debe estar entre 0 y 100');
  const effective =
    input.effectivePrice !== undefined
      ? new D(input.effectivePrice)
      : base.times(new D(1).minus(discount.div(100)));
  if (effective.gt(base))
    fail(
      'El precio efectivo no puede superar el precio base; registra el recargo por separado',
    );
  return {
    base,
    effective,
    // Effective price is authoritative when supplied, so reversing a rounded
    // percentage cannot change the user's entered price.
    discountPercent: base.isZero()
      ? discount.toFixed(12)
      : new D(1).minus(effective.div(base)).times(100).toFixed(12),
  };
}
export type AnnexLine = {
  key: string;
  kind: 'DAY' | 'HOUR' | 'METER';
  label: string;
  date: string;
  quantity: string;
  reportedHours: string | null;
  billableUnits: string;
  basePrice: string;
  effectivePrice: string;
  discountPercent: string;
  gross: string;
  discount: string;
  net: string;
  sources: Array<{ reference: string; origin: string }>;
  employeeIds: string[];
  reason: string | null;
  waived: boolean;
};
export function calculateAnnex(value: unknown) {
  const input = parseAnnexInput(value);
  const { from, to, through } = input.period;
  [from, to, through].forEach(timestamp);
  if (
    from > through ||
    through > to ||
    timestamp(to) - timestamp(from) > 30 * DAY
  )
    fail('Período inválido: máximo 31 días y fecha de datos dentro del corte');
  const minimum = positive(
    input.policy.minimumHoursPerMachineDay,
    'Mínimo horario',
  );
  if (minimum.gt(24)) fail('El mínimo horario no puede superar 24 horas');
  const machineMinimums = new Map<string, Prisma.Decimal>();
  for (const [assetId, hours] of Object.entries(
    input.policy.minimumHoursByAsset ?? {},
  )) {
    const amount = new D(hours);
    if (amount.lt(0) || amount.gt(24))
      fail('El mínimo por equipo debe estar entre 0 y 24 horas');
    machineMinimums.set(assetId, amount);
  }
  input.policy.holidays.forEach(timestamp);
  if (input.policy.holidays.some((date) => date < from || date > to))
    fail('Festivo fuera del período');
  unique(input.policy.holidays, 'Festivos');
  unique(input.policy.excludedWeekdays.map(String), 'Días excluidos');
  unique(
    input.rentals.map((r) => r.id),
    'Alquileres',
  );
  unique(
    input.rentals.map((r) => r.source.reference),
    'Origen de alquileres',
  );
  unique(
    input.machineDays.map((d) => `${d.assetId}:${d.date}`),
    'Máquina/día',
  );
  const lines: AnnexLine[] = [];
  const issues: Array<{ code: string; key: string; message: string }> = [];
  const seenReports = new Set<string>();
  const assetDates = new Set<string>();
  const dates = range(from, through);
  if (!input.policy.holidayCalendarConfirmed)
    issues.push({
      code: 'CALENDAR_PENDING',
      key: 'policy',
      message: 'Confirma el calendario de festivos del período',
    });
  function append(params: {
    key: string;
    kind: 'DAY' | 'HOUR' | 'METER';
    label: string;
    date: string;
    quantity: Prisma.Decimal;
    units: Prisma.Decimal;
    reportedHours: string | null;
    pricing: AnnexInput['rentals'][number]['pricing'];
    sources: AnnexLine['sources'];
    employeeIds?: string[];
    reason?: string;
    waived?: boolean;
  }) {
    const prices = price(params.pricing);
    const gross = params.quantity
      .times(params.units)
      .times(prices.base)
      .toDecimalPlaces(2, D.ROUND_HALF_UP);
    const net = params.waived
      ? new D(0)
      : params.quantity
          .times(params.units)
          .times(prices.effective)
          .toDecimalPlaces(2, D.ROUND_HALF_UP);
    lines.push({
      key: params.key,
      kind: params.kind,
      label: params.label,
      date: params.date,
      quantity: params.quantity.toString(),
      reportedHours: params.reportedHours,
      billableUnits: params.units.toString(),
      basePrice: prices.base.toFixed(2),
      effectivePrice: prices.effective.toFixed(12),
      discountPercent: prices.discountPercent,
      gross: gross.toFixed(2),
      discount: gross.minus(net).toFixed(2),
      net: net.toFixed(2),
      sources: params.sources,
      employeeIds: params.employeeIds ?? [],
      reason: params.reason ?? params.pricing.adjustmentReason ?? null,
      waived: params.waived ?? false,
    });
  }
  for (const rental of input.rentals) {
    if (rental.includedIn) continue;
    if (rental.commercial?.status === 'REVIEW') {
      issues.push({
        code: 'COMMERCIAL_REVIEW',
        key: rental.id,
        message:
          rental.commercial.reason ?? 'Condiciones comerciales pendientes',
      });
      continue;
    }

    const rentalLineStart = lines.length;
    timestamp(rental.deliveredOn);
    const initial = positive(rental.quantity, 'Cantidad');
    if (rental.assetId && !initial.eq(1))
      fail('Un activo serializado debe tener cantidad uno');
    price(rental.pricing);
    unique(
      rental.waivedDays.map((d) => d.date),
      'Excepciones',
    );
    for (const day of rental.waivedDays) {
      timestamp(day.date);
      if (day.date < from || day.date > to) fail('Excepción fuera del período');
    }
    unique(
      rental.returns.map((r) => r.source.reference),
      'Devoluciones del alquiler',
    );
    let returned = new D(0);
    for (const event of rental.returns) {
      timestamp(event.date);
      if (event.date < rental.deliveredOn)
        fail('Devolución anterior a la entrega');
      returned = returned.plus(positive(event.quantity, 'Cantidad devuelta'));
      if (returned.gt(initial))
        fail('Las devoluciones superan la cantidad entregada');
    }
    if (rental.metering || rental.cutting) {
      if (!initial.eq(1))
        fail('Registra la medición por una unidad de equipo a la vez');
      if (rental.dayAdjustments?.length || rental.waivedDays.length)
        fail('La modalidad por metros no admite ajustes de días');
      const cutting = (rental.metering ?? rental.cutting)!;
      const minMeters = new D(cutting.minimumMeters);
      if (minMeters.gt(999999)) fail('Mínimo de metros fuera de rango');
      unique(
        cutting.reports.map((r) => r.source.reference),
        'Reportes de corte',
      );
      let accumulated = new D(0);
      const lastReturn = rental.returns.find((r) => new D(r.quantity).eq(1));
      for (const report of [...cutting.reports].sort((a, b) =>
        a.date.localeCompare(b.date),
      )) {
        timestamp(report.date);
        if (seenReports.has(report.source.reference))
          fail('Reporte de corte duplicado');
        seenReports.add(report.source.reference);
        if (
          report.date < rental.deliveredOn ||
          report.date > through ||
          (lastReturn && report.date > lastReturn.date)
        )
          fail('Reporte de corte fuera del alquiler o del corte de datos');
        if (report.source.origin === 'INVENTORY')
          fail('El corte requiere un reporte físico o digital');
        accumulated = accumulated.plus(new D(report.meters));
      }
      for (const date of dates) {
        if (
          rental.assetId &&
          date >= rental.deliveredOn &&
          (!lastReturn || date <= lastReturn.date)
        ) {
          const key = `${rental.assetId}:${date}`;
          if (assetDates.has(key))
            fail('Activo con alquileres solapados en un mismo día');
          assetDates.add(key);
        }
        const reports = cutting.reports.filter((r) => r.date === date);
        const meters = reports.reduce((sum, r) => sum.plus(r.meters), new D(0));
        const settlement =
          lastReturn?.date === date
            ? D.max(0, minMeters.minus(accumulated))
            : new D(0);
        if (!reports.length && settlement.isZero()) continue;
        append({
          key: `${rental.id}:${date}`,
          kind: 'METER',
          label: rental.label,
          date,
          quantity: initial,
          units: meters.plus(settlement),
          reportedHours: meters.toString(),
          pricing: cutting.pricing,
          sources: [rental.source, ...reports.map((r) => r.source)],
          reason: settlement.gt(0)
            ? 'Completa el mínimo de metros del alquiler'
            : undefined,
        });
      }
      if (!cutting.reports.length)
        issues.push({
          code: 'CUTTING_REPORT_PENDING',
          key: rental.id,
          message: 'Confirma los metros cortados con su reporte',
        });
      continue;
    }
    for (const date of dates) {
      if (date < rental.deliveredOn) continue;
      let balance = initial;
      for (const event of rental.returns) {
        // Even an exclusive return-day policy bills a same-day rental once.
        const remove =
          event.date < date ||
          (!input.policy.includeReturnDay &&
            event.date === date &&
            date !== rental.deliveredOn);
        if (remove) balance = balance.minus(event.quantity);
      }
      if (balance.isZero()) continue;
      if (rental.assetId) {
        const key = `${rental.assetId}:${date}`;
        if (assetDates.has(key))
          fail('Activo con alquileres solapados en un mismo día');
        assetDates.add(key);
      }
      if (
        input.policy.excludedWeekdays.includes(
          new Date(timestamp(date)).getUTCDay(),
        ) ||
        (input.policy.excludeHolidays && input.policy.holidays.includes(date))
      )
        continue;
      const waiver = rental.waivedDays.find((d) => d.date === date);
      append({
        key: `${rental.id}:${date}`,
        kind: 'DAY',
        label: rental.label,
        date,
        quantity: balance,
        units: new D(1),
        reportedHours: null,
        pricing: rental.pricing,
        sources: [
          rental.source,
          ...rental.returns.filter((r) => r.date <= date).map((r) => r.source),
        ],
        reason: waiver?.reason,
        waived: Boolean(waiver),
      });
    }
    // Commercial day overrides never change inventory dates, balances or sources.
    // Retain one line per actual day; extra units belong to the last day of the span.
    const adjustedDates = new Set<string>();
    for (const adjustment of rental.dayAdjustments ?? []) {
      timestamp(adjustment.from);
      timestamp(adjustment.to);
      if (
        adjustment.from < from ||
        adjustment.to > through ||
        adjustment.from > adjustment.to
      )
        fail('El ajuste de días debe estar dentro del corte de datos');
      const affected = lines
        .slice(rentalLineStart)
        .filter(
          (line) => line.date >= adjustment.from && line.date <= adjustment.to,
        );
      const expectedDays = range(adjustment.from, adjustment.to);
      if (
        affected.length !== expectedDays.length ||
        affected.some(
          (line) =>
            line.waived || !new D(line.quantity).eq(adjustment.quantity),
        )
      )
        fail(
          'El tramo del ajuste de días cambió de cantidad o tiene exclusiones; revisa el ajuste antes de guardar',
        );
      const prices = price(rental.pricing);
      affected.forEach((line, index) => {
        if (adjustedDates.has(line.date))
          fail('Los ajustes de días no pueden solaparse');
        adjustedDates.add(line.date);
        const units =
          index === affected.length - 1
            ? Math.max(0, adjustment.days - index)
            : Number(index < adjustment.days);
        const quantity = new D(line.quantity);
        const gross = quantity
          .times(prices.base)
          .toDecimalPlaces(2, D.ROUND_HALF_UP)
          .times(units);
        // Preserve per-day rounding when charging more than one unit on the last date.
        const net = quantity
          .times(prices.effective)
          .toDecimalPlaces(2, D.ROUND_HALF_UP)
          .times(units);
        line.billableUnits = String(units);
        line.gross = gross.toFixed(2);
        line.net = net.toFixed(2);
        line.discount = gross.minus(net).toFixed(2);
      });
    }
    const minDays =
      input.policy.minimumDaysByRental?.[rental.id] ??
      input.policy.minimumDaysBySku?.[rental.skuId] ??
      (rental.commercial?.mode?.unit === 'DAY'
        ? Number(rental.commercial.mode.minimum.value)
        : 0);
    if (minDays) {
      // A minimum is settled only for returned quantities, once in their return cut.
      // Earlier cuts contribute ordinary billed days, never another return's supplement.
      let prior = new D(rental.priorBillableDays ?? 0);
      if (rental.deliveredOn < from && rental.priorBillableDays === undefined) {
        issues.push({
          code: 'MINIMUM_HISTORY_PENDING',
          key: rental.id,
          message:
            'Falta conciliar los días de cortes anteriores para completar el mínimo',
        });
      } else {
        const ordinary = lines.slice(rentalLineStart);
        const returnsByDate = new Map<string, Prisma.Decimal>();
        for (const event of rental.returns) {
          if (event.date >= from && event.date <= through)
            returnsByDate.set(
              event.date,
              (returnsByDate.get(event.date) ?? new D(0)).plus(event.quantity),
            );
        }
        for (const [date, quantity] of returnsByDate) {
          const credited = ordinary
            .filter(
              (line) =>
                line.date <= date &&
                !line.waived &&
                (input.policy.includeReturnDay ||
                  line.date !== date ||
                  date === rental.deliveredOn),
            )
            .reduce((sum, line) => sum.plus(line.billableUnits), prior);
          const extra = D.max(0, new D(minDays).minus(credited));
          if (extra.isZero()) continue;
          append({
            key: `${rental.id}:minimum:${date}`,
            kind: 'DAY',
            label: rental.label,
            date,
            quantity,
            units: extra,
            reportedHours: null,
            pricing: rental.pricing,
            sources: [
              rental.source,
              ...rental.returns
                .filter((r) => r.date === date)
                .map((r) => r.source),
            ],
            reason: 'Completa el mínimo de días del alquiler',
          });
          const supplement = lines[lines.length - 1];
          const prices = price(rental.pricing);
          const gross = quantity
            .times(prices.base)
            .toDecimalPlaces(2, D.ROUND_HALF_UP)
            .times(extra);
          const net = quantity
            .times(prices.effective)
            .toDecimalPlaces(2, D.ROUND_HALF_UP)
            .times(extra);
          supplement.gross = gross.toFixed(2);
          supplement.net = net.toFixed(2);
          supplement.discount = gross.minus(net).toFixed(2);
        }
      }
    }
  }
  for (const day of input.machineDays) {
    if (day.includedIn) continue;
    if (day.commercial?.status === 'REVIEW') {
      issues.push({
        code: 'COMMERCIAL_REVIEW',
        key: day.assetId,
        message: day.commercial.reason ?? 'Condiciones comerciales pendientes',
      });
      continue;
    }

    timestamp(day.date);
    if (day.date < from || day.date > through)
      fail('Reporte fuera del corte de datos');
    const key = `${day.assetId}:${day.date}`;
    if (assetDates.has(key))
      fail('Activo cobrado simultáneamente por día y por hora');
    price(day.pricing);
    if (day.status !== 'REPORTED') {
      if (day.reports.length || day.waiverReason)
        fail('Día sin reporte no puede contener horas ni exención');
      if (day.status === 'NO_WORK' && !day.confirmationReason)
        fail('Confirma el motivo del día sin actividad');
      if (day.status === 'PENDING')
        issues.push({
          code: 'REPORT_PENDING',
          key,
          message: 'Confirma si hubo trabajo o registra el reporte',
        });
      continue;
    }
    if (!day.reports.length)
      fail('El día reportado requiere al menos un reporte');
    let hours = new D(0);
    for (const report of day.reports) {
      if (report.source.origin === 'INVENTORY')
        fail('Un reporte horario debe ser físico o digital');
      // A physical report transcribed digitally keeps its original reference.
      // Switching channel must never allow the same report to be counted twice.
      if (seenReports.has(report.source.reference))
        fail('Reporte horario duplicado');
      seenReports.add(report.source.reference);
      hours = hours.plus(positive(report.hours, 'Horas reportadas'));
    }
    if (hours.gt(24)) fail('Las horas de una máquina/día no pueden superar 24');
    const employeeIds = [
      ...new Set(day.reports.map((r) => r.employeeId)),
    ].sort();
    append({
      key,
      kind: 'HOUR',
      label: day.label,
      date: day.date,
      quantity: new D(1),
      units: D.max(
        hours,
        machineMinimums.get(day.assetId) ??
          (day.commercial?.mode?.unit === 'HOUR'
            ? new D(day.commercial.mode.minimum.value)
            : minimum),
      ),
      reportedHours: hours.toString(),
      pricing: day.pricing,
      sources: day.reports.map((r) => r.source),
      employeeIds,
      reason: day.waiverReason,
      waived: Boolean(day.waiverReason),
    });
    issues.push({
      code: 'LABOR_PENDING',
      key,
      message:
        'Pendiente clasificar jornada real y costo adicional del operario; las horas mínimas de alquiler no son horas de nómina',
    });
  }
  lines.sort(
    (a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key),
  );
  const sum = (field: 'gross' | 'discount' | 'net') =>
    lines.reduce((total, line) => total.plus(line[field]), new D(0)).toFixed(2);
  return {
    engineVersion: '2',
    rounding: 'PER_DAY_HALF_UP_2' as const,
    status: 'DRAFT' as const,
    period: input.period,
    policyVersion: input.policy.version,
    lines,
    issues,
    totals: {
      rentalGross: sum('gross'),
      rentalDiscount: sum('discount'),
      rentalNet: sum('net'),
    },
    // Completeness of inventory/reports is established by the source adapter,
    // never by the absence of calculation errors in user-supplied input.
    sourceCompleteness: 'UNVERIFIED' as const,
  };
}
