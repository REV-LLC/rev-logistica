/** Calendar day in the company's timezone, never the server's timezone. */
export function hourMeterReminderOccurrence(now: Date): string | null {
  if (process.env.HOUR_METER_REMINDER_ENABLED?.trim().toLowerCase() === 'false') {
    return null;
  }
  const time = process.env.HOUR_METER_REMINDER_TIME?.trim() || '17:00';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('HOUR_METER_REMINDER_TIME debe tener formato HH:mm (00:00–23:59).');
  }
  const timeZone = process.env.HOUR_METER_REMINDER_TIME_ZONE?.trim() || 'America/Bogota';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (`${values.hour}:${values.minute}` < time) return null;
  return `daily:${values.year}-${values.month}-${values.day}`;
}
