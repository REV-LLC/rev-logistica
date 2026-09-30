export type AnnexLocation = {
  customer: string | null;
  worksite: string | null;
  period: { from: string; to: string; through: string };
};
function civil(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function readAnnexLocation(
  search: string,
  fallback: AnnexLocation["period"],
): AnnexLocation | null {
  const params = new URLSearchParams(search);
  if (
    !["customer", "worksite", "from", "to", "through"].some((k) =>
      params.has(k),
    )
  )
    return null;
  const customer = params.get("customer"),
    worksite = params.get("worksite");
  for (const id of [customer, worksite])
    if (id && !/^[a-zA-Z0-9-]{1,120}$/.test(id))
      throw new Error("El enlace contiene un cliente u obra inválido.");
  if (worksite && !customer)
    throw new Error("El enlace de la obra debe incluir el cliente.");
  const hasDates = ["from", "to", "through"].some((k) => params.has(k));
  const period = hasDates
    ? {
        from: params.get("from") ?? "",
        to: params.get("to") ?? "",
        through: params.get("through") ?? "",
      }
    : fallback;
  if (
    !Object.values(period).every(civil) ||
    period.from > period.through ||
    period.through > period.to ||
    Date.parse(period.to) - Date.parse(period.from) > 30 * 86400000
  )
    throw new Error("El enlace contiene un intervalo de fechas inválido.");
  return { customer, worksite, period };
}
export function annexLocationUrl(current: string, value: AnnexLocation) {
  const url = new URL(current);
  for (const [key, entry] of Object.entries({
    customer: value.customer,
    worksite: value.worksite,
    ...value.period,
  })) {
    if (entry) url.searchParams.set(key, entry);
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
