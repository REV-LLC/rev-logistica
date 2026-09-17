import { BadRequestException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';

export type AssetValidationReason =
  | 'LOCATION_CONFLICT'
  | 'AMBIGUOUS_TRANSFER'
  | 'NO_LOCATION'
  | 'RETROACTIVE'
  | 'NOT_IN_WAREHOUSE'
  | 'NOT_IN_OWNER_WAREHOUSE'
  | 'NOT_ON_SITE'
  | 'NOT_FOUND'
  | 'OWNER_MISMATCH'
  | 'OWNER_NOT_FOUND';

export type AssetValidationLocation = {
  type: 'WAREHOUSE' | 'WORKSITE';
  id: string;
};

export type AssetValidationErrorOptions = {
  code: string;
  reason: AssetValidationReason;
  expectedLocation?: AssetValidationLocation;
  latestMovement?: {
    movementType: MovementType;
    warehouseId: string | null;
    customerWorksiteId: string | null;
    effectiveAt: Date;
    isOpeningBalance?: boolean;
    quantity?: number | Prisma.Decimal;
  };
  requestedEffectiveAt?: Date;
  details?: Record<string, unknown>;
};

// A missing catalogue label must never turn a database identifier into UI copy.
function readableText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function localDate(value: Date | undefined): string | undefined {
  if (!value || !Number.isFinite(value.getTime())) return undefined;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function localTime(value: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

/** Builds presentation only, after the caller has already rejected a movement. */
export async function buildAssetValidationError(
  tx: Prisma.TransactionClient,
  assetId: string,
  options: AssetValidationErrorOptions,
): Promise<BadRequestException> {
  const [asset] = await tx.asset.findMany({
    where: { id: { in: [assetId] } },
    select: {
      description: true,
      brand: true,
      model: true,
      internalNumber: true,
      sku: { select: { name: true } },
      warehouseOwner: { select: { name: true } },
    },
  });
  const name = readableText(asset?.description)
    || readableText(asset?.sku?.name)
    || [readableText(asset?.brand), readableText(asset?.model)].filter(Boolean).join(' ');
  const internalNumber = Number.isInteger(asset?.internalNumber) && asset.internalNumber > 0
    ? ` #${asset.internalNumber}`
    : '';
  const owner = readableText(asset?.warehouseOwner?.name);
  const assetLabel = `${name || 'Equipo seleccionado'}${internalNumber}${owner ? ` (${owner})` : ''}`;
  const subject = name
    ? `el equipo ${assetLabel}`
    : `el equipo seleccionado${internalNumber}${owner ? ` (${owner})` : ''}`;
  const capitalSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
  const genitiveSubject = subject.replace(/^el /, 'del ');

  // Resolve only names required by this rejected operation. Cache identical
  // locations so an origin and a latest entry in the same place use one read.
  const locationNames = new Map<string, Promise<string>>();
  function locationName(location: AssetValidationLocation): Promise<string> {
    const key = `${location.type}:${location.id}`;
    const existing = locationNames.get(key);
    if (existing) return existing;
    const pending = location.type === 'WAREHOUSE'
      ? tx.warehouse.findUnique({
        where: { id: location.id },
        select: { name: true },
      }).then((warehouse) => {
        const label = readableText(warehouse?.name);
        return label ? `bodega «${label}»` : 'bodega sin nombre registrado';
      })
      : tx.customerWorksite.findUnique({
        where: { id: location.id },
        select: { alias: true, worksite: { select: { name: true } } },
      }).then((customerWorksite) => {
        const label = readableText(customerWorksite?.alias)
          || readableText(customerWorksite?.worksite?.name);
        return label ? `obra «${label}»` : 'obra sin nombre registrado';
      });
    locationNames.set(key, pending);
    return pending;
  }

  async function registeredLocation(): Promise<string> {
    const latest = options.latestMovement;
    if (!latest) return 'sin ubicación registrada';
    if (latest.movementType === MovementType.TRANSIT) return 'en tránsito';
    if ((latest.movementType === MovementType.OUT || latest.movementType === MovementType.ON_SITE)
      && latest.customerWorksiteId) {
      return locationName({ type: 'WORKSITE', id: latest.customerWorksiteId });
    }
    if ((latest.movementType === MovementType.IN
      || latest.movementType === MovementType.ADJUST)
      && Number(latest.quantity) > 0
      && latest.warehouseId) {
      return locationName({ type: 'WAREHOUSE', id: latest.warehouseId });
    }
    const warehouse = latest.warehouseId
      ? ` de ${await locationName({ type: 'WAREHOUSE', id: latest.warehouseId })}`
      : '';
    if (latest.movementType === MovementType.OUT) {
      return `no confirmada; el último registro es una salida${warehouse}`;
    }
    if (latest.movementType === MovementType.ADJUST) {
      return `no confirmada; el último registro es un ajuste${warehouse}`;
    }
    if (latest.movementType === MovementType.IN && !(Number(latest.quantity) > 0)) {
      return `no confirmada; el último registro es una entrada sin cantidad positiva${warehouse}`;
    }
    return 'no confirmada por el último movimiento';
  }

  async function locationContext(expectedTitle = 'Origen del documento'): Promise<string> {
    const [expected, registered] = await Promise.all([
      options.expectedLocation ? locationName(options.expectedLocation) : undefined,
      options.latestMovement ? registeredLocation() : undefined,
    ]);
    return [
      expected ? `${expectedTitle}: ${expected}.` : '',
      registered ? `Ubicación registrada: ${registered}.` : '',
    ].filter(Boolean).join(' ');
  }

  let message: string;
  switch (options.reason) {
    case 'AMBIGUOUS_TRANSFER':
      message = `Los registros del traslado ${genitiveSubject} no permiten confirmar su ubicación. Revisa la entrada y la salida del traslado antes de continuar.`;
      break;
    case 'LOCATION_CONFLICT':
      message = `La ubicación registrada ${genitiveSubject} no coincide con el origen del documento. ${await locationContext()}`;
      break;
    case 'NO_LOCATION':
      message = `${capitalSubject} no tiene una ubicación registrada. Revisa su ubicación y el origen del documento.`;
      break;
    case 'RETROACTIVE': {
      const requestedDate = localDate(options.requestedEffectiveAt);
      const latestDate = localDate(options.latestMovement?.effectiveAt);
      const sameLocalDay = requestedDate && requestedDate === latestDate;
      const requestedTime = sameLocalDay && options.requestedEffectiveAt
        ? ` a las ${localTime(options.requestedEffectiveAt)}` : '';
      const latestTime = sameLocalDay && options.latestMovement
        ? ` a las ${localTime(options.latestMovement.effectiveAt)}` : '';
      message = `No se puede registrar el movimiento${requestedDate ? ` del ${requestedDate}${requestedTime}` : ' solicitado'} para ${subject} porque tiene un movimiento posterior${latestDate ? ` con fecha ${latestDate}${latestTime}` : ''}. Revisa las fechas y la secuencia de movimientos.`;
      break;
    }
    case 'NOT_IN_WAREHOUSE':
      message = `${capitalSubject} no figura disponible en la bodega de origen del documento. ${await locationContext()}`;
      break;
    case 'NOT_IN_OWNER_WAREHOUSE':
      message = `${capitalSubject} no figura disponible en la bodega del propietario indicada. ${await locationContext('Bodega indicada')}`;
      break;
    case 'NOT_ON_SITE':
      message = `${capitalSubject} no figura disponible en la obra indicada. ${await locationContext('Obra indicada')}`;
      break;
    case 'NOT_FOUND':
      message = `${capitalSubject} no se encuentra entre los equipos activos. Actualiza el documento y vuelve a seleccionar el equipo.`;
      break;
    case 'OWNER_MISMATCH':
      message = `El propietario ${genitiveSubject} no coincide con el indicado en el documento. Revisa el propietario seleccionado.`;
      break;
    case 'OWNER_NOT_FOUND':
      message = `No se encontró el propietario indicado para ${subject}. Revisa el propietario seleccionado.`;
      break;
  }

  return new BadRequestException({
    ...options.details,
    code: options.code,
    message: message.trim(),
    assetId,
    assetLabel,
    ...(options.expectedLocation ? { expectedLocation: options.expectedLocation } : {}),
    ...(options.latestMovement ? { latestEffectiveAt: options.latestMovement.effectiveAt } : {}),
    ...(options.requestedEffectiveAt ? { requestedEffectiveAt: options.requestedEffectiveAt } : {}),
  });
}
