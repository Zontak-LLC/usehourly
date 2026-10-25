import { formatCount } from "@/lib/money";
import { NOTE_MAX } from "@/lib/notes";

export type MergeInput = {
  id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | string | null;
};

export type MergePlan = { keepId: string; deleteIds: string[]; minutes: number; note: string };

const MAX_MINUTES = 24 * 60;

/**
 * Plan folding several entries (same project, same day) into the first one: hours add up and
 * the descriptions are joined, one per line, skipping blanks and exact repeats. Returns an
 * error message instead of a plan when the merge wouldn't be safe or wouldn't fit, so nothing
 * is ever silently dropped.
 */
export function planMerge(entries: MergeInput[]): MergePlan | { error: string } {
  if (entries.length < 2) return { error: "Pick at least two entries to merge." };
  const [first, ...rest] = entries;
  if (entries.some((e) => e.project_id !== first.project_id)) {
    return { error: "Those entries are on different projects. Move them to one project first, then merge." };
  }
  if (entries.some((e) => e.date !== first.date)) return { error: "Only entries from the same day can be merged." };
  if (entries.some((e) => e.started_at)) return { error: "Stop the running timer before merging that entry." };

  const minutes = entries.reduce((a, e) => a + e.minutes, 0);
  if (minutes > MAX_MINUTES) return { error: "Merged, that would be more than 24 hours in one day." };

  const seen = new Set<string>();
  const parts: string[] = [];
  for (const e of entries) {
    const n = e.note.trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    parts.push(n);
  }
  const note = parts.join("\n");
  if (note.length > NOTE_MAX) {
    return {
      error: `The combined description would be ${formatCount(note.length)} characters; the limit is ${formatCount(NOTE_MAX)}. Shorten one of them first.`,
    };
  }
  return { keepId: first.id, deleteIds: rest.map((e) => e.id), minutes, note };
}

export type MergeGroup<T extends MergeInput> = { date: string; projectId: string; entries: T[] };

/** Every (day, project) pair that has two or more entries, oldest day first. */
export function findMergeGroups<T extends MergeInput>(entries: T[]): MergeGroup<T>[] {
  const byKey = new Map<string, MergeGroup<T>>();
  for (const e of entries) {
    const key = `${e.date}|${e.project_id}`;
    const g = byKey.get(key) ?? { date: e.date, projectId: e.project_id, entries: [] };
    g.entries.push(e);
    byKey.set(key, g);
  }
  return [...byKey.values()].filter((g) => g.entries.length >= 2).sort((a, b) => a.date.localeCompare(b.date));
}
