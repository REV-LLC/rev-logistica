export type AnnexLocation = {
  customer: string | null;
  worksite: string | null;
  period: { from: string; to: string; through: string };
  browse?: boolean;
  draft?: string;
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
    !["customer", "worksite", "from", "to", "through", "browse", "draft"].some(
      (k) => params.has(k),
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
  const draft = params.get("draft");
  if (draft && (!/^[a-zA-Z0-9-]{1,120}$/.test(draft) || !worksite || !customer))
    throw new Error(
      "El enlace del anexo debe incluir un cliente y una obra válidos.",
    );
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
  return {
    customer,
    worksite,
    period,
    ...(params.get("browse") === "1" ? { browse: true } : {}),
    ...(draft ? { draft } : {}),
  };
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
  if (value.browse) url.searchParams.set("browse", "1");
  else url.searchParams.delete("browse");
  if (value.draft) url.searchParams.set("draft", value.draft);
  else url.searchParams.delete("draft");
  return `${url.pathname}${url.search}${url.hash}`;
}

// New annexes must use the visible end date, never a stale hidden cut boundary.
// Saved revisions keep their original identity when advancing their data cutoff.
export function newAnnexPeriod(
  from: string,
  through: string,
): AnnexLocation["period"] {
  return { from, to: through, through };
}

/** Folder links do not generate a live annex just by visiting a customer or worksite. */
export function annexBrowseUrl(value: {
  customer: string;
  worksite?: string;
  draft?: string;
  period?: AnnexLocation["period"];
}) {
  const params = new URLSearchParams({ customer: value.customer });
  if (value.worksite) params.set("worksite", value.worksite);
  if (value.draft) params.set("draft", value.draft);
  else params.set("browse", "1");
  if (value.period)
    for (const [key, entry] of Object.entries(value.period))
      params.set(key, entry);
  return `/billing/annexes?${params}`;
}
