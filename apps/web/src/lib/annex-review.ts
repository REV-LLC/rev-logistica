import type { AnnexInput, SourceIssue } from '../app/billing/annexes/types';

const messages: Record<string, string> = {
  CATALOG_PRICE_REVIEW:
    'Se usaron los precios actuales del catálogo. Comprueba que sean los acordados con el cliente para estas fechas.',
  COMMERCIAL_HISTORY_REVIEW:
    'Estas entregas no tienen guardadas las condiciones acordadas al entregar el equipo. Revisa los precios, descuentos y mínimos antes de facturar.',
};

export function annexReviewNotices(issues: SourceIssue[], input: AnnexInput) {
  const notices = new Map<string, { message: string; equipment: string[] }>();
  for (const issue of issues) {
    const message = messages[issue.code] ?? issue.message;
    const key = `${issue.code}:${message}`;
    const notice = notices.get(key) ?? { message, equipment: [] };
    const rental = input.rentals.find(
      (r) => r.id === issue.reference || r.source.reference === issue.reference,
    );
    if (rental && !notice.equipment.includes(rental.label))
      notice.equipment.push(rental.label);
    notices.set(key, notice);
  }
  return [...notices.values()];
}
