export type SheetEntry = {
  id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | string | null;
  /** True when the entry's day is marked non-billable: exports and invoices leave it out (the server sets this). */
  non_billable?: boolean;
  /** The team member who logged it (null or absent for the account's own entries). */
  author_id?: string | null;
  author?: { name: string | null } | null;
  project: { name: string; hourly_rate: number; billable: boolean; client: { name: string; color: string } };
};

export type Cell = { minutes: number; count: number; running: boolean };

export type SheetRow = {
  projectId: string;
  project: string;
  client: string;
  color: string;
  cells: Record<string, Cell>;
  total: number;
};

export type Sheet = {
  rows: SheetRow[];
  dayTotals: Record<string, number>;
  total: number;
};

/** Pivot entries into project × day rows. `extraProjects` adds empty rows (e.g. projects with no time yet). */
export function buildSheet(
  entries: SheetEntry[],
  extraProjects: { projectId: string; project: string; client: string; color: string }[] = [],
): Sheet {
  const rows = new Map<string, SheetRow>();
  for (const x of extraProjects) {
    rows.set(x.projectId, { ...x, cells: {}, total: 0 });
  }
  const dayTotals: Record<string, number> = {};
  let total = 0;

  for (const e of entries) {
    const row =
      rows.get(e.project_id) ??
      ({
        projectId: e.project_id,
        project: e.project.name,
        client: e.project.client.name,
        color: e.project.client.color,
        cells: {},
        total: 0,
      } satisfies SheetRow);
    const cell = row.cells[e.date] ?? { minutes: 0, count: 0, running: false };
    cell.minutes += e.minutes;
    cell.count += 1;
    cell.running ||= !!e.started_at;
    row.cells[e.date] = cell;
    row.total += e.minutes;
    rows.set(e.project_id, row);
    dayTotals[e.date] = (dayTotals[e.date] ?? 0) + e.minutes;
    total += e.minutes;
  }

  const sorted = [...rows.values()].sort(
    (a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project),
  );
  return { rows: sorted, dayTotals, total };
}

/** Every date from `from` to `to` inclusive (YYYY-MM-DD). */
export function dateRange(from: string, to: string, step: (d: string, n: number) => string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = step(d, 1)) out.push(d);
  return out;
}
