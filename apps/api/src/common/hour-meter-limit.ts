import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DAY_MS = 86_400_000;
const businessDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});
function businessDay(date: Date) {
  const parts = businessDayFormat.formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
  return Date.UTC(value('year'), value('month') - 1, value('day')) / DAY_MS;
}

type Reading = { hours: Prisma.Decimal; recordedAt: Date };
type Subject = { assetId: string; vehicleId?: never } | { vehicleId: string; assetId?: never };

/** Call inside the same serializable transaction that writes the meter/reading.
 * The previous-day meter and the first same-day reading both constrain the increase,
 * so multiple submissions cannot each spend another 24 hours of allowance.
 * An initial reading without history establishes the meter's starting value.
 */
export async function assertHourMeterIncrease(
  tx: Prisma.TransactionClient,
  subject: Subject,
  currentHours: Prisma.Decimal.Value,
  hours: number,
  recordedAt: Date,
  now = new Date(),
) {
  if (!Number.isFinite(recordedAt.getTime()) || recordedAt > now) {
    throw new BadRequestException('La fecha de lectura no puede estar en el futuro ni ser inválida.');
  }
  const day = businessDay(recordedAt);
  const start = new Date(day * DAY_MS + 5 * 3_600_000);
  const find = (where: Prisma.DateTimeFilter | undefined, direction: 'asc' | 'desc'): Promise<Reading | null> => {
    const options = {
      select: { hours: true, recordedAt: true },
      orderBy: [{ recordedAt: direction }, { createdAt: direction }, { id: direction }],
    };
    return subject.assetId
      ? tx.assetHourReading.findFirst({ ...options, where: { assetId: subject.assetId, ...(where ? { recordedAt: where } : {}) } })
      : tx.vehicleHourReading.findFirst({ ...options, where: { vehicleId: subject.vehicleId!, ...(where ? { recordedAt: where } : {}) } });
  };
  const [latest, firstToday, previousDay] = await Promise.all([
    find(undefined, 'desc'), find({ gte: start, lte: recordedAt }, 'asc'), find({ lt: start }, 'desc'),
  ]);
  if (!latest) return;
  if (new Prisma.Decimal(hours).gt(currentHours) && recordedAt < latest.recordedAt) {
    throw new BadRequestException('Una lectura que aumenta el horómetro no puede tener una fecha anterior a la última lectura registrada.');
  }
  for (const reference of [latest, firstToday, previousDay]) {
    if (!reference || reference.recordedAt > recordedAt) continue;
    const days = Math.max(1, day - businessDay(reference.recordedAt));
    const limit = new Prisma.Decimal(reference.hours).plus(days * 24);
    if (new Prisma.Decimal(hours).gt(limit)) {
      throw new BadRequestException({
        code: 'HOUR_METER_DAILY_LIMIT',
        message: `El horómetro no puede aumentar más de 24 horas por día. Desde la lectura de ${reference.hours.toString()} h del ${businessDayFormat.format(reference.recordedAt)}, el máximo para la fecha indicada es ${limit.toString()} h. Revisa la lectura y la fecha.`,
      });
    }
  }
}
