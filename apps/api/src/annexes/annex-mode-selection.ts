import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseAnnexInput, type AnnexInput } from './annex-input';
import { resolveCommercialMode } from '../commercial-profiles/commercial-resolver';

export function selectAnnexMode(value: unknown) {
  const parsed = z
    .object({
      input: z.unknown(),
      rentalId: z.string().min(1).max(120),
      modeId: z.string().uuid(),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success)
    throw new BadRequestException('Selección de modalidad inválida');
  const request = parsed.data;
  const input = structuredClone(parseAnnexInput(request.input));
  const index = input.rentals.findIndex((r) => r.id === request.rentalId);
  const days = input.machineDays.filter((d) => d.rentalId === request.rentalId);
  const rental = index >= 0 ? input.rentals[index] : days[0]?.rentalContext;
  if (!rental)
    throw new BadRequestException(
      'No se encontró el tramo físico de esta modalidad',
    );
  const original = rental.commercial;
  const profile = original?.frozenProfile;
  const mode = profile?.modes.find((m) => m.id === request.modeId);
  if (
    !original ||
    !profile ||
    !mode ||
    !original.catalog ||
    original.contextualZero ||
    rental.includedIn
  )
    throw new BadRequestException(
      'Selecciona una modalidad del perfil guardado para esta entrega',
    );
  if (
    mode.pricing.source === 'CATALOG' &&
    (mode.unit !== original.catalog.unit || original.catalog.price === null)
  )
    throw new BadRequestException(
      'La modalidad no tiene una tarifa histórica en esa unidad',
    );
  if (
    (mode.unit === 'METER' || mode.unit === 'HOUR') &&
    Number(rental.quantity) !== 1
  )
    throw new BadRequestException(
      'La medición requiere una unidad identificada por línea',
    );
  const resolved = resolveCommercialMode(
    { ...profile, modes: [{ ...mode, conditions: [] }] },
    original.parts,
    original.catalog,
  );
  const changedParts = resolved.parts.some(
    (part) =>
      original.parts.find((p) => p.documentItemId === part.documentItemId)
        ?.treatment !== part.treatment,
  );
  if (changedParts) {
    for (const child of [...input.rentals, ...input.machineDays]) {
      const affected = resolved.parts.some(
        (part) =>
          (part.assetId && part.assetId === child.assetId) ||
          (part.accessoryId &&
            part.accessoryId ===
              ('id' in child
                ? child.accessoryId
                : child.rentalContext?.accessoryId)),
      );
      if (affected && child.commercial)
        child.commercial = {
          ...child.commercial,
          status: 'REVIEW',
          reason:
            'Revisa la tarifa de esta pieza después del cambio manual de modalidad del conjunto',
        };
    }
  }
  rental.modeArchive = {
    ...rental.modeArchive,
    ...(rental.metering ? { metering: rental.metering } : {}),
    ...(rental.dayAdjustments ? { dayAdjustments: rental.dayAdjustments } : {}),
    ...(rental.waivedDays.length ? { waivedDays: rental.waivedDays } : {}),
    ...(days.length
      ? { machineDays: days.map(({ rentalContext, ...day }) => day) }
      : {}),
  };
  const minimumReview =
    original.minimumReview ||
    (original.mode?.id !== mode.id &&
      (Number(mode.minimum.value) > 0 ||
        Number(original.mode?.minimum.value ?? 0) > 0));
  rental.commercial = {
    ...original,
    ...resolved,
    mode,
    selectedModeId: mode.id,
    minimumReview: Boolean(minimumReview),
    ...(original.status === 'REVIEW'
      ? { status: 'REVIEW' as const, reason: original.reason }
      : {}),
    ...(minimumReview
      ? {
          status: 'REVIEW' as const,
          reason:
            'Confirma cómo distribuir los mínimos entre las modalidades utilizadas en este alquiler',
        }
      : {}),
    ...(changedParts
      ? {
          status: 'REVIEW' as const,
          reason:
            'La modalidad cambia las tarifas de piezas del conjunto; concilia esas líneas antes de cobrar',
        }
      : {}),
  };
  rental.pricing = {
    basePrice:
      resolved.basePrice ??
      (mode.pricing.source === 'FIXED'
        ? mode.pricing.amount
        : original.catalog.price!),
  };
  delete rental.metering;
  delete rental.cutting;
  delete rental.dayAdjustments;
  rental.waivedDays = [];
  if (input.policy.minimumDaysByRental)
    delete input.policy.minimumDaysByRental[rental.id];
  const identity = rental.assetId ?? rental.accessoryId;
  if (identity && input.policy.minimumHoursByAsset)
    delete input.policy.minimumHoursByAsset[identity];
  input.machineDays = input.machineDays.filter((d) => d.rentalId !== rental.id);
  if (index >= 0) input.rentals.splice(index, 1);
  if (mode.unit === 'HOUR') {
    if (!identity)
      throw new BadRequestException(
        'La modalidad por horas requiere identificar el equipo',
      );
    const from = rental.commercialInterval?.from ?? rental.deliveredOn;
    const to = rental.commercialInterval?.to ?? input.period.through;
    for (
      let time = Math.max(Date.parse(from), Date.parse(input.period.from));
      time <= Math.min(Date.parse(to), Date.parse(input.period.through));
      time += 86400000
    ) {
      const date = new Date(time).toISOString().slice(0, 10);
      if (
        rental.returns
          .filter((r) => r.date < date)
          .reduce((sum, r) => sum + Number(r.quantity), 0) >=
        Number(rental.quantity)
      )
        continue;
      const saved = rental.modeArchive?.machineDays?.find(
        (d) => d.date === date,
      );
      input.machineDays.push({
        ...(saved ?? {
          assetId: identity,
          label: rental.label,
          date,
          status: 'PENDING',
          reports: [],
        }),
        rentalId: rental.id,
        commercial: rental.commercial,
        pricing: rental.pricing,
        rentalContext: rental,
      });
    }
  } else {
    if (mode.unit === 'METER')
      rental.metering = {
        minimumMeters: mode.minimum.value,
        pricing: rental.pricing,
        reports: rental.modeArchive?.metering?.reports ?? [],
        priorUnits: rental.modeArchive?.metering?.priorUnits,
      };
    else {
      rental.dayAdjustments = rental.modeArchive?.dayAdjustments;
      rental.waivedDays = rental.modeArchive?.waivedDays ?? [];
      input.policy.minimumDaysByRental = {
        ...input.policy.minimumDaysByRental,
        [rental.id]: Number(mode.minimum.value),
      };
    }
    input.rentals.splice(index >= 0 ? index : input.rentals.length, 0, rental);
  }
  return parseAnnexInput(input);
}
