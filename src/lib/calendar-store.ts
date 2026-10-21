import { z } from "zod";

import { type CalendarEvent, MAX_EVENTS } from "@/lib/calendar-events";

/**
 * The imported calendar (issue #99), kept ONLY in this browser (localStorage), under the account that imported it. The
 * file itself is never kept or sent anywhere: only recent meetings' titles and times are (a few KB), and they are
 * forgotten on sign-out and whenever a different account is signed in, like the AI key.
 */
export const CALENDAR_KEY = "hourly:calendar";
export const CALENDAR_SKIPPED_KEY = "hourly:calendarSkipped";
export const CALENDAR_EVENT = "hourly:calendar-changed";
/** How far back an import keeps meetings, and how many "skipped" marks are remembered. */
export const KEEP_DAYS = 90;
const MAX_SKIPPED = 500;
/** A saved calendar over this many characters is refused (browsers allow about 5 million per site). */
const MAX_CHARS = 1_000_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const saved = z.object({
  userId: z.string().min(1),
  importedAt: z.number(),
  name: z.string().max(200),
  events: z
    .array(
      z.object({
        uid: z.string().max(400),
        title: z.string().max(200),
        start: z.number(),
        end: z.number(),
      }),
    )
    .max(MAX_EVENTS),
});
export type SavedCalendar = z.infer<typeof saved>;

/** The calendar imported by this account, or null (none, another account's, damaged, or storage unreadable). */
export function loadCalendar(storage: StorageLike | null, userId: string | null | undefined): SavedCalendar | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(CALENDAR_KEY);
    if (!raw) return null;
    const ok = saved.safeParse(JSON.parse(raw));
    return ok.success && ok.data.userId === userId ? ok.data : null;
  } catch {
    return null;
  }
}

/** Saves an import for this account. False when it is too big or storage refuses. */
export function saveCalendar(
  storage: StorageLike | null,
  userId: string,
  value: { name: string; events: CalendarEvent[]; importedAt: number },
): boolean {
  if (!storage || !userId) return false;
  try {
    const text = JSON.stringify({ userId, ...value, name: value.name.slice(0, 200) });
    if (text.length > MAX_CHARS) return false;
    storage.setItem(CALENDAR_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the calendar and the "skipped" marks. */
export function forgetCalendar(storage: StorageLike | null): void {
  try {
    storage?.removeItem(CALENDAR_KEY);
    storage?.removeItem(CALENDAR_SKIPPED_KEY);
  } catch {
    // storage blocked
  }
}

export function loadSkipped(storage: StorageLike | null, userId: string | null | undefined): Set<string> {
  if (!storage || !userId) return new Set();
  try {
    const parsed = z
      .object({ userId: z.string(), ids: z.array(z.string().max(500)).max(MAX_SKIPPED) })
      .safeParse(JSON.parse(storage.getItem(CALENDAR_SKIPPED_KEY) ?? "null"));
    return parsed.success && parsed.data.userId === userId ? new Set(parsed.data.ids) : new Set();
  } catch {
    return new Set();
  }
}

/** Remembers that a meeting was skipped, so it is not offered again. Keeps the newest few hundred. */
export function addSkipped(storage: StorageLike | null, userId: string, id: string): void {
  if (!storage || !userId) return;
  try {
    const ids = [...loadSkipped(storage, userId).add(id)].slice(-MAX_SKIPPED);
    storage.setItem(CALENDAR_SKIPPED_KEY, JSON.stringify({ userId, ids }));
  } catch {
    // storage full or blocked: the meeting may be offered again, nothing worse
  }
}

/** Events worth keeping from an import: the last KEEP_DAYS and tomorrow. */
export function keepWindow(now: Date): { from: Date; to: Date } {
  const from = new Date(now);
  from.setDate(from.getDate() - KEEP_DAYS);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setDate(to.getDate() + 2);
  to.setHours(0, 0, 0, 0);
  return { from, to };
}
