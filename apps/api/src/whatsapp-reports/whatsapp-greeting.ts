const hourFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  hourCycle: 'h23',
});
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const businessGreeting = (at = new Date()) =>
  Number(hourFormatter.format(at)) < 12 ? 'Buenos días' : 'Buenas tardes';
export const sameBusinessDay = (left: Date, right: Date) =>
  dayFormatter.format(left) === dayFormatter.format(right);
