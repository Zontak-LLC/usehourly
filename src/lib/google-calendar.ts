import { z } from "zod";

import { type CalendarEvent, MAX_EVENTS } from "@/lib/calendar-events";

/**
 * Reading the day's meetings straight from Google Calendar, in the browser (issue #99). The person signs in with
 * Google's own popup, the browser gets a short-lived read-only token and asks Google for the events; UseHourly's
 * servers never see the token or the calendar. The same rules as the file import apply: all-day events, events marked
 * free, cancelled ones and ones the person declined are left out, and only a title, a start and an end are kept.
 */

/** The narrowest permission that reads events: no editing, no calendar list, no contacts. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const PAGE_SIZE = 250;
export const MAX_PAGES = 12;
const TITLE_MAX = 120;

export class GoogleCalendarError extends Error {}

const when = z.object({ dateTime: z.string().optional(), date: z.string().optional() }).partial();
const item = z.object({
  id: z.string().max(400),
  summary: z.string().optional(),
  status: z.string().optional(),
  transparency: z.string().optional(),
  start: when.optional(),
  end: when.optional(),
  attendees: z.array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() })).optional(),
});
const page = z.object({ items: z.array(z.unknown()).default([]), nextPageToken: z.string().optional() });

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
    const parsed = item.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
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
    const body = page.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new GoogleCalendarError(explainGoogleStatus(0));
    events.push(...googleEventsToCalendar(body.data.items));
    pageToken = body.data.nextPageToken;
    if (!pageToken) break;
  }
  events.sort((a, b) => a.start - b.start);
  return { events: events.slice(0, MAX_EVENTS), truncated: events.length > MAX_EVENTS || Boolean(pageToken) };
}
