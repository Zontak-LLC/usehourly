import { type CalendarEvent, MAX_EVENTS } from "@/lib/calendar-events";
import { type Fields, isFields, isText } from "@/lib/stored-guards";

/**
 * Reading the day's meetings straight from Google Calendar, in the browser (issue #99). The person signs in with
 * Google's own popup, the browser gets a short-lived read-only token and asks Google for the events; UseHourly's
 * servers never see the token or the calendar. The same rules as the file import apply: all-day events, events marked
 * free, cancelled ones and ones the person declined are left out, and only a title, a start and an end are kept.
 * Google's answer is outside data: each page and each item is checked by hand (no zod, this file runs in the
 * browser) before anything is read from it.
 */

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const PAGE_SIZE = 250;
export const MAX_PAGES = 12;
const TITLE_MAX = 120;

export class GoogleCalendarError extends Error {}

/** The fields of a Google event this file reads; any others are ignored. */
type GoogleItem = {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const ID_MAX = 400;

const isOptionalText = (v: unknown): v is string | undefined => v === undefined || isText(v);
const isOptionalWhen = (v: unknown) =>
  v === undefined || (isFields(v) && isOptionalText(v.dateTime) && isOptionalText(v.date));
const isAttendee = (v: unknown) =>
  isFields(v) && (v.self === undefined || typeof v.self === "boolean") && isOptionalText(v.responseStatus);

/** One event as Google sends it: an id of at most 400 characters; every other field optional, but of its type. */
function isGoogleItem(v: unknown): v is Fields & GoogleItem {
  if (!isFields(v) || !isText(v.id, 0, ID_MAX)) return false;
  if (!isOptionalText(v.summary) || !isOptionalText(v.status) || !isOptionalText(v.transparency)) return false;
  if (!isOptionalWhen(v.start) || !isOptionalWhen(v.end)) return false;
  return v.attendees === undefined || (Array.isArray(v.attendees) && v.attendees.every(isAttendee));
}

/** One page of Google's answer, or undefined when it is not one. A page without `items` has none. */
function readPage(v: unknown): { items: unknown[]; nextPageToken?: string } | undefined {
  if (!isFields(v)) return undefined;
  const { items, nextPageToken } = v;
  if (!isOptionalText(nextPageToken)) return undefined;
  if (items !== undefined && !Array.isArray(items)) return undefined;
  return { items: items ?? [], nextPageToken };
}

/** The address of one page of events. `singleEvents` makes Google expand repeating meetings into their occurrences. */
export function eventsUrl(range: { from: Date; to: Date }, pageToken?: string): string {
  const q = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(PAGE_SIZE),
    timeMin: range.from.toISOString(),
    timeMax: range.to.toISOString(),
    fields: "nextPageToken,items(id,summary,status,transparency,start,end,attendees(self,responseStatus))",
  });
  if (pageToken) q.set("pageToken", pageToken);
  return `${API}?${q}`;
}

/** Meetings worth offering from one page of Google's answer. Items that do not look like events are ignored. */
export function googleEventsToCalendar(items: readonly unknown[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const raw of items) {
    if (!isGoogleItem(raw)) continue;
    const e = raw;
    if (e.status === "cancelled") continue;
    if (e.transparency === "transparent") continue; // shown as free
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const from = e.start?.dateTime; // an all-day event has only `date`
    const to = e.end?.dateTime;
    if (!from || !to) continue;
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) continue;
    out.push({ uid: e.id, title: (e.summary ?? "").trim().slice(0, TITLE_MAX) || "(no title)", start, end });
  }
  return out;
}

/** What to tell the person when Google refuses, in plain words (never Google's own text). */
export function explainGoogleStatus(status: number): string {
  if (status === 401) return "Google says the sign-in ran out. Tap Connect Google Calendar again.";
  if (status === 403) return "Google wouldn't share the calendar. Check that you allowed reading your events.";
  if (status === 429) return "Google says too many requests. Try again in a minute.";
  return "Couldn't reach Google Calendar. Try again in a moment.";
}

/** Reads the meetings in `range` from the person's main calendar with a read-only access token. */
export async function fetchGoogleEvents(
  token: string,
  range: { from: Date; to: Date },
  fetcher: typeof fetch = fetch,
): Promise<{ events: CalendarEvent[]; truncated: boolean }> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let n = 0; n < MAX_PAGES; n++) {
    let res: Response;
    try {
      res = await fetcher(eventsUrl(range, pageToken), { headers: { authorization: `Bearer ${token}` } });
    } catch {
      throw new GoogleCalendarError(explainGoogleStatus(0));
    }
    if (!res.ok) throw new GoogleCalendarError(explainGoogleStatus(res.status));
    const body = readPage(await res.json().catch(() => null));
    if (!body) throw new GoogleCalendarError(explainGoogleStatus(0));
    events.push(...googleEventsToCalendar(body.items));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  events.sort((a, b) => a.start - b.start);
  return { events: events.slice(0, MAX_EVENTS), truncated: events.length > MAX_EVENTS || Boolean(pageToken) };
}
