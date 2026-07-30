const METER_UNIT = /^(?:M|MT|MTS|METRO|METROS)$/i;
const CENTIMETER_UNIT = /^CM$/i;
const MEASURE_WITH_UNIT =
  /\(?\s*(\d+(?:[.,]\d+)?)\s*\)?\s*(CM|MTS?|METROS?|M)\b/gi;
const INLINE_MEASURE_WITH_UNIT = /(\d+(?:[.,]\d+)?)\s*(CM|MTS?|METROS?|M)\b/gi;

function formatDecimal(value: number) {
  return value.toFixed(2);
}

function formatMeterValue(rawValue: string, rawUnit: string) {
  const parsed = Number(rawValue.replace(',', '.'));
  if (!Number.isFinite(parsed)) return `${rawValue} M`;
  const meters = CENTIMETER_UNIT.test(rawUnit) ? parsed / 100 : parsed;
  return `${formatDecimal(meters)} M`;
}

export function normalizeMeasurementLabel(value: string | null | undefined) {
  if (!value) return null;
  return value
    .trim()
    .replace(MEASURE_WITH_UNIT, (_match, rawValue: string, rawUnit: string) =>
      METER_UNIT.test(rawUnit) || CENTIMETER_UNIT.test(rawUnit)
        ? formatMeterValue(rawValue, rawUnit)
        : _match,
    )
    .replace(/(\bM|\d|\))\s*[x×]\s*(?=\(?\d)/gi, '$1 X ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedWords(value: string) {
  return value
    .toLocaleUpperCase('es-CO')
    .replace(/\bANGULO\b/g, 'ÁNGULO')
    .replace(/\bELECTRICO\b/g, 'ELÉCTRICO')
    .replace(/\bHIDRAULICO\b/g, 'HIDRÁULICO')
    .replace(/\bNEUMATICO\b/g, 'NEUMÁTICO')
    .replace(/\bMETALICA\b/g, 'METÁLICA')
    .replace(/\bCAMARA\b/g, 'CÁMARA')
    .replace(/\s+/g, ' ')
    .trim();
}

function baseBeforeMeterMeasurement(value: string) {
  const decimalMeasurement = value.search(/\d+[.,]\d+/);
  if (decimalMeasurement >= 0) {
    return value.slice(0, decimalMeasurement);
  }
  const integerMeterMeasurement = value.search(
    /\d+\s*(?:CM|MTS?|METROS?|M)\b/i,
  );
  return integerMeterMeasurement >= 0
    ? value.slice(0, integerMeterMeasurement)
    : value;
}

function cleanMeasurementBase(value: string) {
  return value
    .replace(/[\s([]+$/g, '')
    .replace(/\bDE$/i, '')
    .replace(/[\s([]+$/g, '')
    .trim();
}

export function normalizeSkuReference(
  name: string,
  size: string | null | undefined,
) {
  const normalizedSize = normalizeMeasurementLabel(size);
  const hasMeterSize = normalizedSize?.includes(' M') ?? false;
  let result = name.trim();

  if (hasMeterSize) {
    const base = cleanMeasurementBase(baseBeforeMeterMeasurement(result));
    result = `${base} (${normalizedSize})`;
  } else {
    result = result.replace(
      INLINE_MEASURE_WITH_UNIT,
      (_match, rawValue: string, rawUnit: string) =>
        formatMeterValue(rawValue, rawUnit),
    );
  }

  return normalizedWords(result).replace(/\s+/g, ' ').trim();
}
