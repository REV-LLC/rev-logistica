export function attendancePresetRange(preset: string, today: string) {
  const first = new Date(`${today}T12:00:00Z`);
  if (preset === "month") {
    first.setUTCDate(1);
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    return {
      from: first.toISOString().slice(0, 10),
      to: last.toISOString().slice(0, 10),
    };
  }
  if (preset === "week")
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return { from: first.toISOString().slice(0, 10), to: today };
}
export function attendanceDayTitle(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    month: "2-digit",
    day: "numeric",
  }).formatToParts(new Date(value));
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return `${["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][month - 1]} ${day}`;
}
