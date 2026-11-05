import { type CalendarEvent, MAX_EVENTS } from "@/lib/calendar-events";
import { MAX_LINK_CHARS } from "@/lib/calendar-link";
import { type CalendarRule, MAX_RULE_CHARS, MAX_RULES } from "@/lib/calendar-suggest";
import { type Fields, isFields, isListUpTo, isNumber, isText } from "@/lib/stored-guards";

/**
 * The imported calendar (issue #99), kept ONLY in this browser (localStorage), under the account that imported it. The
 * file itself is never kept or sent anywhere: only recent meetings' titles and times are (a few KB), and they are
 * forgotten on sign-out and whenever a different account is signed in, like the AI key.
 */
export const CALENDAR_KEY = "hourly:calendar";
export const CALENDAR_SKIPPED_KEY = "hourly:calendarSkipped";
/** The private calendar address, when the calendar is connected by link instead of a file (slice 2). It is a secret. */
export const CALENDAR_LINK_KEY = "hourly:calendarLink";
/** Set when the calendar was read straight from Google Calendar (slice 4): there is no secret, only "connected". */
export const CALENDAR_GOOGLE_KEY = "hourly:calendarGoogle";
/** The person's meeting rules ("acme" meetings go on Acme / Design), issue 99. */
export const CALENDAR_RULES_KEY = "hourly:calendarRules";
export const CALENDAR_EVENT = "hourly:calendar-changed";
/** How far back an import keeps meetings, and how many "skipped" marks are remembered. */
export const KEEP_DAYS = 90;
const MAX_SKIPPED = 500;
/** A saved calendar over this many characters is refused (browsers allow about 5 million per site). */
const MAX_CHARS = 1_000_000;

/**
 * Counts "the calendar was removed, replaced or signed out". A read of a connected address takes a few seconds; if one
 * of those happened meanwhile, the read must not write its result (or the secret address) back.
 */
let generation = 0;
export const calendarGeneration = () => generation;
export const cancelCalendarReads = () => {
  generation++;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SavedCalendar = { userId: string; importedAt: number; name: string; events: CalendarEvent[] };

/*
 * The stored values are checked by hand (no zod in the browser, issue 425) with the rules the zod schemas had: each
 * parse returns only the known fields, or null when any rule fails, and the whole value is then dropped.
 */

function parseEvent(v: unknown): CalendarEvent | null {
  if (!isFields(v)) return null;
  const { uid, title, start, end } = v;
  return isText(uid, 0, 400) && isText(title, 0, 200) && isNumber(start) && isNumber(end)
    ? { uid, title, start, end }
    : null;
}

/** Each item of `list` through `parse`, or null when one fails (as `z.array` did). */
function parseAll<T>(list: unknown[], parse: (v: unknown) => T | null): T[] | null {
  const out: T[] = [];
  for (const item of list) {
    const ok = parse(item);
    if (ok === null) return null;
    out.push(ok);
  }
  return out;
}

function parseSavedCalendar(v: unknown): SavedCalendar | null {
  if (!isFields(v)) return null;
  const { userId, importedAt, name, events } = v;
  if (!isText(userId, 1) || !isNumber(importedAt) || !isText(name, 0, 200) || !isListUpTo(events, MAX_EVENTS)) {
    return null;
  }
  const parsed = parseAll(events, parseEvent);
  return parsed && { userId, importedAt, name, events: parsed };
}

/** The stored value's fields when it belongs to `userId` (`{ userId: z.string(), ... }` and the same account). */
function ownedBy(v: unknown, userId: string): Fields | null {
  return isFields(v) && isText(v.userId) && v.userId === userId ? v : null;
}

function parseRule(v: unknown): CalendarRule | null {
  if (!isFields(v)) return null;
  const { word, projectId } = v;
  return isText(word, 1, MAX_RULE_CHARS) && isText(projectId, 1, 100) ? { word, projectId } : null;
}

/** The calendar imported by this account, or null (none, another account's, damaged, or storage unreadable). */
export function loadCalendar(storage: StorageLike | null, userId: string | null | undefined): SavedCalendar | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(CALENDAR_KEY);
    if (!raw) return null;
    const calendar = parseSavedCalendar(JSON.parse(raw));
    return calendar && calendar.userId === userId ? calendar : null;
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

/** The calendar address this account connected, or null. */
export function loadLink(storage: StorageLike | null, userId: string | null | undefined): string | null {
  if (!storage || !userId) return null;
  try {
    const url = ownedBy(JSON.parse(storage.getItem(CALENDAR_LINK_KEY) ?? "null"), userId)?.url;
    return isText(url, 0, MAX_LINK_CHARS) ? url : null;
  } catch {
    return null;
  }
}

/** Keeps the connected address for this account; null forgets it (a file import replaces a link). */
export function saveLink(storage: StorageLike | null, userId: string, url: string | null): boolean {
  if (!storage || !userId) return false;
  try {
    if (url === null) storage.removeItem(CALENDAR_LINK_KEY);
    else storage.setItem(CALENDAR_LINK_KEY, JSON.stringify({ userId, url }));
    return true;
  } catch {
    return false;
  }
}

/** Whether this account's calendar came from Google Calendar (so Refresh opens Google's popup, not a file box). */
export function loadGoogle(storage: StorageLike | null, userId: string | null | undefined): boolean {
  if (!storage || !userId) return false;
  try {
    return ownedBy(JSON.parse(storage.getItem(CALENDAR_GOOGLE_KEY) ?? "null"), userId) !== null;
  } catch {
    return false;
  }
}

export function saveGoogle(storage: StorageLike | null, userId: string, on: boolean): boolean {
  if (!storage || !userId) return false;
  try {
    if (on) storage.setItem(CALENDAR_GOOGLE_KEY, JSON.stringify({ userId }));
    else storage.removeItem(CALENDAR_GOOGLE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the calendar, its address, the "skipped" marks and the meeting rules. */
export function forgetCalendar(storage: StorageLike | null): void {
  cancelCalendarReads();
  try {
    storage?.removeItem(CALENDAR_KEY);
    storage?.removeItem(CALENDAR_SKIPPED_KEY);
    storage?.removeItem(CALENDAR_LINK_KEY);
    storage?.removeItem(CALENDAR_GOOGLE_KEY);
    storage?.removeItem(CALENDAR_RULES_KEY);
  } catch {
    // storage blocked
  }
}

export function loadSkipped(storage: StorageLike | null, userId: string | null | undefined): Set<string> {
  if (!storage || !userId) return new Set();
  try {
    const ids = ownedBy(JSON.parse(storage.getItem(CALENDAR_SKIPPED_KEY) ?? "null"), userId)?.ids;
    const ok = isListUpTo(ids, MAX_SKIPPED) && ids.every((id): id is string => isText(id, 0, 500));
    return ok ? new Set(ids) : new Set();
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

/** This account's meeting rules, oldest first (empty when none, another account's, damaged or unreadable). */
export function loadRules(storage: StorageLike | null, userId: string | null | undefined): CalendarRule[] {
  if (!storage || !userId) return [];
  try {
    const rules = ownedBy(JSON.parse(storage.getItem(CALENDAR_RULES_KEY) ?? "null"), userId)?.rules;
    return (isListUpTo(rules, MAX_RULES) && parseAll(rules, parseRule)) || [];
  } catch {
    return [];
  }
}

/** Keeps this account's meeting rules; an empty list forgets them. False when storage refuses. */
export function saveRules(storage: StorageLike | null, userId: string, rules: readonly CalendarRule[]): boolean {
  if (!storage || !userId) return false;
  try {
    if (rules.length === 0) storage.removeItem(CALENDAR_RULES_KEY);
    else storage.setItem(CALENDAR_RULES_KEY, JSON.stringify({ userId, rules: rules.slice(-MAX_RULES) }));
    return true;
  } catch {
    return false;
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
