import { previousFortnight } from './annex-minimums';

export type Cut = { from: string; to: string; through: string };
export type SavedCut = {
  id: string;
  from: string;
  to: string;
  through: string;
  invoiceNumber: string | null;
  billedDays: string[];
  manual: boolean;
};
export type BillingRow = {
  from: string;
  to: string;
  through: string;
  draftId: string | null;
  invoiceNumber: string | null;
};

export function billingCuts(today: string): Cut[] {
  const date = new Date(today + 'T00:00:00Z');
  const first = date.getUTCDate() <= 15;
  const from = today.slice(0, 8) + (first ? '01' : '16');
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const to = first ? today.slice(0, 8) + '15' : date.toISOString().slice(0, 10);
  const cuts = [{ from, to, through: today }];
  while (cuts.length < 4) {
    const previous = previousFortnight(cuts[0].from);
    cuts.unshift({ ...previous, through: previous.to });
  }
  return cuts;
}

const nextDay = (day: string) =>
  new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);

/** A monthly or partial invoice covers only the dates actually included in its saved revision. */
export function classifyBillingCut(
  cut: Cut,
  activeDays: Set<string>,
  saved: SavedCut[],
): BillingRow[] {
  const rows: BillingRow[] = [];
  const dates = new Set(activeDays);
  for (const draft of saved) {
    if (draft.manual) dates.add(draft.through);
    if (draft.invoiceNumber) draft.billedDays.forEach((day) => dates.add(day));
  }
  const invoices = saved.filter((draft) => draft.invoiceNumber);
  const covered = (draft: SavedCut, day: string) =>
    draft.from <= day && day <= draft.to && day <= draft.through;
  for (const draft of invoices) {
    const from = draft.from > cut.from ? draft.from : cut.from;
    const through = [draft.through, draft.to, cut.through].sort()[0];
    if ([...dates].some((day) => day >= from && day <= through)) {
      rows.push({
        from,
        to: through,
        through,
        draftId: draft.id,
        invoiceNumber: draft.invoiceNumber,
      });
    }
  }

  // Split pending ranges at existing annex boundaries so opening one never bills
  // dates already covered by another invoice, including invoices spanning two cuts.
  const pending: BillingRow[] = [];
  for (let day = cut.from; day <= cut.through; day = nextDay(day)) {
    if (invoices.some((draft) => covered(draft, day))) continue;
    const existing = saved.find(
      (draft) =>
        !draft.invoiceNumber &&
        draft.from <= day &&
        day <= draft.to &&
        !invoices.some(
          (invoice) =>
            invoice.from <= draft.through && invoice.through >= draft.from,
        ),
    );
    const draftId = existing?.id ?? null;
    const last = pending.at(-1);
    if (last && last.draftId === draftId && nextDay(last.through) === day) {
      last.through = day;
      last.to = day;
    } else {
      pending.push({
        from: day,
        to: day,
        through: day,
        draftId,
        invoiceNumber: null,
      });
    }
  }
  for (const range of pending) {
    if (![...dates].some((day) => day >= range.from && day <= range.through))
      continue;
    if (range.through === cut.through && !range.draftId) range.to = cut.to;
    rows.push(range);
  }
  return rows;
}
