import type { OfficeEvidence } from './office-database.service';

/** Column names once, then positional values. UI/export keep the original typed evidence. */
export function compactEvidence(source: OfficeEvidence, remaining: number) {
  const rows: unknown[][] = [];
  const base = { id: source.id, title: source.title, columns: source.columns,
    queriedAt: source.queriedAt, rowCount: 0, truncated: true, rows };
  let used = JSON.stringify(base).length;
  for (const row of source.rows) {
    const values = source.columns.map((column) => row[column] ?? null);
    const size = JSON.stringify(values).length + 1;
    if (used + size > remaining) break;
    rows.push(values);
    used += size;
  }
  return { used, data: { ...base, rowCount: rows.length,
    truncated: source.truncated || rows.length < source.rows.length } };
}
