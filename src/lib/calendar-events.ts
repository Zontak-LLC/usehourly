/**
 * Reading meetings out of a calendar file (.ics) for "suggest time entries from my calendar" (issue #99).
 *
 * Only what a time entry needs is kept: a title, a start and an end. Everything that is not a meeting you attended is
 * left out: all-day events, events marked free ("transparent"), cancelled ones and ones you declined. Recurring events
 * are expanded (weekly stand-ups, with skipped dates and moved or cancelled single occurrences), and time zones are
 * honoured, so a 10:00 New York meeting is the right instant wherever the browser is.
 *
 * The parser (ical.js) is loaded only when a file is read, so it never weighs on a normal page.
 */
export type CalendarEvent = {
  /** The calendar's own id for the event (the same for every repeat of a recurring one). */
  uid: string;
  title: string;
  /** Epoch milliseconds. */
  start: number;
  end: number;
};

export class CalendarFileError extends Error {}

/** The most events one import keeps, and the most repeats one recurring event is stepped through. */
export const MAX_EVENTS = 3_000;
const MAX_STEPS = 20_000;
const TITLE_MAX = 120;

type Options = {
  /** The person's own addresses, to drop events they declined. */
  selfEmails?: readonly string[];
};

export async function readCalendar(
  text: string,
  range: { from: Date; to: Date },
  options: Options = {},
): Promise<{ events: CalendarEvent[]; truncated: boolean }> {
  const ICAL = (await import("ical.js")).default;
  const me = new Set((options.selfEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));

  let root: InstanceType<typeof ICAL.Component>;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new CalendarFileError("That doesn't look like a calendar file. Export one from your calendar as .ics.");
  }
  if (root.name !== "vcalendar") {
    throw new CalendarFileError("That doesn't look like a calendar file. Export one from your calendar as .ics.");
  }

  // ical.js reads the file's own time-zone blocks (VTIMEZONE) and relates a moved or cancelled repeat to its series
  // itself: both are covered by the tests. A zone the file never defines is read in the browser's own zone.
  const masters: InstanceType<typeof ICAL.Event>[] = [];
  for (const v of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    if (!ev.isRecurrenceException() && ev.uid) masters.push(ev);
  }

  const out: CalendarEvent[] = [];
  const from = range.from.getTime();
  const to = range.to.getTime();

  const keep = (uid: string, item: InstanceType<typeof ICAL.Event>, start: Date, end: Date) => {
    const comp = item.component;
    if (item.startDate.isDate) return; // all-day
    if (String(comp.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    if (String(comp.getFirstPropertyValue("transp") ?? "").toUpperCase() === "TRANSPARENT") return; // shown as free
    for (const a of comp.getAllProperties("attendee")) {
      const who = String(a.getFirstValue() ?? "")
        .replace(/^mailto:/i, "")
        .toLowerCase();
      if (me.has(who) && String(a.getParameter("partstat") ?? "").toUpperCase() === "DECLINED") return;
    }
    const s = start.getTime();
    const e = end.getTime();
    if (!(e > s) || e < from || s > to) return;
    out.push({ uid, title: (item.summary ?? "").trim().slice(0, TITLE_MAX) || "(no title)", start: s, end: e });
  };

  for (const ev of masters) {
    if (out.length > MAX_EVENTS) break;
    if (!ev.isRecurring()) {
      keep(ev.uid, ev, ev.startDate.toJSDate(), ev.endDate.toJSDate());
      continue;
    }
    const it = ev.iterator();
    for (let steps = 0, next = it.next(); next && steps < MAX_STEPS; next = it.next(), steps++) {
      const d = ev.getOccurrenceDetails(next);
      const start = d.startDate.toJSDate();
      if (start.getTime() > to) break;
      keep(ev.uid, d.item, start, d.endDate.toJSDate());
    }
  }

  out.sort((a, b) => a.start - b.start);
  return { events: out.slice(0, MAX_EVENTS), truncated: out.length > MAX_EVENTS };
}
