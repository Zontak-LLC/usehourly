import type { SheetEntry } from "@/lib/timesheet";

export const WORK_ITEMS_PAGE_SIZE = 7;

/**
 * Entries matching every word of `query` (case-insensitive) against the note, project, client
 * and date, so "acme homepage" narrows and "2026-10-06" finds a day. Order is preserved.
 */
export function searchWorkItems(entries: SheetEntry[], query: string): SheetEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((e) => {
    const haystack = `${e.note} ${e.project.name} ${e.project.client.name} ${e.date}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export type Page<T> = { items: T[]; page: number; pages: number; total: number; from: number; to: number };

/** One page of `size` items. `page` is 1-based and clamped, so a shrinking list never strands you. */
export function paginate<T>(items: T[], page: number, size = WORK_ITEMS_PAGE_SIZE): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
  };
}

export type DayGroup<T> = { date: string; minutes: number; items: T[] };

/** Consecutive items of the same date become one group; `minutes` totals that date across ALL matches. */
export function groupByDay<T extends { date: string; minutes: number }>(items: T[], all: T[]): DayGroup<T>[] {
  const totals = new Map<string, number>();
  for (const e of all) totals.set(e.date, (totals.get(e.date) ?? 0) + e.minutes);
  const groups: DayGroup<T>[] = [];
  for (const e of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, minutes: totals.get(e.date) ?? 0, items: [e] });
  }
  return groups;
}

export type ProjectGroup<T> = {
  projectId: string;
  project: string;
  client: string;
  color: string;
  minutes: number;
  items: T[];
};

/** Entries ordered by project (the project with the most time first, then each project's newest day first). */
export function orderByProject<T extends { project_id: string; date: string; minutes: number }>(items: T[]): T[] {
  const totals = new Map<string, number>();
  for (const e of items) totals.set(e.project_id, (totals.get(e.project_id) ?? 0) + e.minutes);
  return [...items].sort(
    (a, b) =>
      (totals.get(b.project_id) ?? 0) - (totals.get(a.project_id) ?? 0) ||
      a.project_id.localeCompare(b.project_id) ||
      b.date.localeCompare(a.date),
  );
}

/** Consecutive items of the same project become one group; `minutes` totals that project across ALL matches. */
export function groupByProject<
  T extends { project_id: string; minutes: number; project: { name: string; client: { name: string; color: string } } },
>(items: T[], all: T[]): ProjectGroup<T>[] {
  const totals = new Map<string, number>();
  for (const e of all) totals.set(e.project_id, (totals.get(e.project_id) ?? 0) + e.minutes);
  const groups: ProjectGroup<T>[] = [];
  for (const e of items) {
    const last = groups[groups.length - 1];
    if (last && last.projectId === e.project_id) last.items.push(e);
    else {
      groups.push({
        projectId: e.project_id,
        project: e.project.name,
        client: e.project.client.name,
        color: e.project.client.color,
        minutes: totals.get(e.project_id) ?? 0,
        items: [e],
      });
    }
  }
  return groups;
}
