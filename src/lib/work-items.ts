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
