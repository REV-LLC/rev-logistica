/** Civil document date, independent of server timezone or approval timestamp. */
export const COMPOSITION_V2_FROM = '2026-10-01';
export function commercialBusinessDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}
export function usesCommercialV2(value: Date): boolean {
  return commercialBusinessDate(value) >= COMPOSITION_V2_FROM;
}
