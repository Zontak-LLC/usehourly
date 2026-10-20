import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/routers/_app";

type Out = inferRouterOutputs<AppRouter>;
export type EntryListItem = Out["entry"]["list"][number];
export type ClientWithProjects = Out["clients"]["list"][number];
export type DayRange = { from: string; to: string };

/** An entry shown before the server has confirmed it: its id starts with this, and it cannot be edited or deleted yet. */
export const PENDING_PREFIX = "pending-";
export const isPendingId = (id: string) => id.startsWith(PENDING_PREFIX);

export const inRange = (date: string, range: DayRange) => date >= range.from && date <= range.to;

const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0);

/** Newest day first, and within a day the newest entry first: the order the server returns. */
function newestFirst(a: EntryListItem, b: EntryListItem): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return time(b.created_at) - time(a.created_at);
}

/** Adds a row to a loaded list when its day is inside the list's range; otherwise the list is untouched. */
export function addEntry(rows: EntryListItem[], range: DayRange, row: EntryListItem): EntryListItem[] {
  if (!inRange(row.date, range) || rows.some((r) => r.id === row.id)) return rows;
  return [...rows, row].sort(newestFirst);
}

/**
 * Changes one row of a loaded list. A list that does not contain the row is untouched. A row whose new day falls
 * outside the list's range leaves it (moving an entry to another week removes it from this week's list).
 */
export function patchEntry(
  rows: EntryListItem[],
  range: DayRange,
  id: string,
  patch: Partial<EntryListItem>,
): EntryListItem[] {
  const at = rows.findIndex((r) => r.id === id);
  if (at === -1) return rows;
  const merged = { ...rows[at], ...patch };
  const without = rows.filter((r) => r.id !== id);
  return inRange(merged.date, range) ? [...without, merged].sort(newestFirst) : without;
}

export function removeEntry(rows: EntryListItem[], id: string): EntryListItem[] {
  return rows.some((r) => r.id === id) ? rows.filter((r) => r.id !== id) : rows;
}

/** The days a cached `entry.list` or `entry.nonBillableDays` query covers, read from its key: [[path], { input }]. */
export function rangeOfKey(queryKey: readonly unknown[]): DayRange | null {
  const meta = queryKey[1];
  const input = typeof meta === "object" && meta !== null ? (meta as { input?: unknown }).input : undefined;
  if (typeof input !== "object" || input === null) return null;
  const { from, to } = input as { from?: unknown; to?: unknown };
  return typeof from === "string" && typeof to === "string" && from !== "" ? { from, to } : null;
}

/** A marked-days list with one day added or removed (kept oldest first, like the server's). */
export function withNonBillableDay(days: string[], range: DayRange, date: string, on: boolean): string[] {
  if (!inRange(date, range)) return days;
  const rest = days.filter((d) => d !== date);
  return (on ? [...rest, date] : rest).sort();
}

/** A project together with its client, as an entry carries them, taken from the client list already on screen. */
export function projectWithClient(
  clients: ClientWithProjects[] | undefined,
  projectId: string,
): EntryListItem["project"] | null {
  for (const c of clients ?? []) {
    const project = c.projects.find((p) => p.id === projectId);
    if (project) {
      const { projects: _projects, ...client } = c;
      return { ...project, client };
    }
  }
  return null;
}

/**
 * The row to show for an entry that was just typed, built from what is already on screen (the project and client lists)
 * so it needs no server answer. It is replaced by the real row when the server confirms.
 */
export function pendingEntry(input: {
  clientId: string;
  userId: string;
  client: ClientWithProjects;
  projectId: string;
  date: string;
  minutes: number;
  note: string;
  nonBillable: boolean;
}): EntryListItem | null {
  const project = projectWithClient([input.client], input.projectId);
  if (!project) return null;
  const now = new Date().toISOString(); // the wire format: dates arrive from the server as text
  return {
    id: `${PENDING_PREFIX}${input.clientId}`,
    user_id: input.userId,
    project_id: project.id,
    date: input.date,
    minutes: input.minutes,
    note: input.note,
    started_at: null,
    created_at: now,
    updated_at: now,
    author_id: null,
    project,
    author: null,
    non_billable: input.nonBillable,
  };
}
