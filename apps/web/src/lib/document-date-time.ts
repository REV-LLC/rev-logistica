const documentDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getDocumentDateTimeInput(value: string | Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  const parts = documentDateTimeFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function isDocumentTimeValid(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function buildDocumentDateTime(
  date: string,
  time: string,
  originalTimestamp?: string | null,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isDocumentTimeValid(time)) return null;
  const timestamp = `${date}T${time}:00-05:00`;
  const normalized = getDocumentDateTimeInput(timestamp);
  if (normalized.date !== date || normalized.time !== time) return null;

  // Keep the original seconds when reopening a draft without changing its date or time.
  if (originalTimestamp) {
    const original = getDocumentDateTimeInput(originalTimestamp);
    if (original.date === date && original.time === time) return originalTimestamp;
  }
  return timestamp;
}
