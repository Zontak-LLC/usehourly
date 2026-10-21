import { describe, expect, it } from "vitest";

import { CalendarFileError, readCalendar } from "@/lib/calendar-events";

import { ics, vevent } from "./fixtures/calendar";

const RANGE = { from: new Date("2026-10-12T00:00:00Z"), to: new Date("2026-10-31T00:00:00Z") };
const read = (text: string, selfEmails: string[] = []) => readCalendar(text, RANGE, { selfEmails });
const iso = (ms: number) => new Date(ms).toISOString();

describe("reading a calendar file", () => {
  it("reads a time-zoned meeting as the right instant (New York in daylight saving time is UTC-4)", async () => {
    const { events } = await read(
      ics(
        vevent([
          "UID:a1",
          "DTSTART;TZID=America/New_York:20261014T100000",
          "DTEND;TZID=America/New_York:20261014T110000",
          "SUMMARY:Acme sync",
        ]),
      ),
    );
    expect(events).toHaveLength(1);
    expect(iso(events[0].start)).toBe("2026-10-14T14:00:00.000Z");
    expect(iso(events[0].end)).toBe("2026-10-14T15:00:00.000Z");
    expect(events[0].title).toBe("Acme sync");
  });

  it("uses winter time after the clocks change (UTC-5 from the first Sunday of November)", async () => {
    const wide = { from: new Date("2026-10-12T00:00:00Z"), to: new Date("2026-12-31T00:00:00Z") };
    const { events } = await readCalendar(
      ics(
        vevent([
          "UID:w1",
          "DTSTART;TZID=America/New_York:20261110T100000",
          "DTEND;TZID=America/New_York:20261110T110000",
          "SUMMARY:Winter meeting",
        ]),
      ),
      wide,
    );
    expect(iso(events[0].start)).toBe("2026-11-10T15:00:00.000Z");
  });

  it("reads UTC times as they are", async () => {
    const { events } = await read(
      ics(vevent(["UID:u1", "DTSTART:20261015T130000Z", "DTEND:20261015T133000Z", "SUMMARY:Standup"])),
    );
    expect(iso(events[0].start)).toBe("2026-10-15T13:00:00.000Z");
    expect(events[0].end - events[0].start).toBe(30 * 60_000);
  });

  it("leaves out everything that is not a meeting you attended", async () => {
    const { events } = await read(
      ics(
        vevent(["UID:keep", "DTSTART:20261015T130000Z", "DTEND:20261015T140000Z", "SUMMARY:Keep me"]),
        vevent(["UID:allday", "DTSTART;VALUE=DATE:20261015", "DTEND;VALUE=DATE:20261016", "SUMMARY:Holiday"]),
        vevent([
          "UID:free",
          "DTSTART:20261015T150000Z",
          "DTEND:20261015T160000Z",
          "SUMMARY:Focus",
          "TRANSP:TRANSPARENT",
        ]),
        vevent([
          "UID:cancelled",
          "DTSTART:20261015T160000Z",
          "DTEND:20261015T170000Z",
          "SUMMARY:Gone",
          "STATUS:CANCELLED",
        ]),
        vevent([
          "UID:declined",
          "DTSTART:20261015T170000Z",
          "DTEND:20261015T180000Z",
          "SUMMARY:Not going",
          "ATTENDEE;PARTSTAT=DECLINED:mailto:me@example.com",
        ]),
        vevent([
          "UID:other",
          "DTSTART:20261015T180000Z",
          "DTEND:20261015T190000Z",
          "SUMMARY:Someone else declined",
          "ATTENDEE;PARTSTAT=DECLINED:mailto:them@example.com",
        ]),
      ),
      ["Me@Example.com"],
    );
    expect(events.map((e) => e.title)).toEqual(["Keep me", "Someone else declined"]);
  });

  it("expands a weekly meeting, skips the dates taken out, and finds ones that started years ago", async () => {
    const { events } = await read(
      ics(
        vevent([
          "UID:weekly",
          "DTSTART;TZID=America/New_York:20230102T090000", // a Monday, years before the window
          "DTEND;TZID=America/New_York:20230102T094500",
          "RRULE:FREQ=WEEKLY;BYDAY=MO",
          "EXDATE;TZID=America/New_York:20261019T090000",
          "SUMMARY:Monday stand-up",
        ]),
      ),
    );
    expect(events.map((e) => iso(e.start))).toEqual(["2026-10-12T13:00:00.000Z", "2026-10-26T13:00:00.000Z"]); // 19th is skipped
    expect(events[0].end - events[0].start).toBe(45 * 60_000);
  });

  it("follows one repeat that was moved, and drops one that was cancelled", async () => {
    const { events } = await read(
      ics(
        vevent([
          "UID:series",
          "DTSTART:20261012T140000Z",
          "DTEND:20261012T150000Z",
          "RRULE:FREQ=WEEKLY;COUNT=3",
          "SUMMARY:Planning",
        ]),
        vevent([
          "UID:series",
          "RECURRENCE-ID:20261019T140000Z",
          "DTSTART:20261019T160000Z", // moved two hours later
          "DTEND:20261019T170000Z",
          "SUMMARY:Planning (moved)",
        ]),
        vevent([
          "UID:series",
          "RECURRENCE-ID:20261026T140000Z",
          "DTSTART:20261026T140000Z",
          "DTEND:20261026T150000Z",
          "STATUS:CANCELLED",
          "SUMMARY:Planning",
        ]),
      ),
    );
    expect(events.map((e) => [iso(e.start), e.title])).toEqual([
      ["2026-10-12T14:00:00.000Z", "Planning"],
      ["2026-10-19T16:00:00.000Z", "Planning (moved)"],
    ]);
  });

  it("keeps only what falls in the window, and names an untitled event", async () => {
    const { events } = await read(
      ics(
        vevent(["UID:early", "DTSTART:20260101T130000Z", "DTEND:20260101T140000Z", "SUMMARY:Too early"]),
        vevent(["UID:late", "DTSTART:20261201T130000Z", "DTEND:20261201T140000Z", "SUMMARY:Too late"]),
        vevent(["UID:blank", "DTSTART:20261016T130000Z", "DTEND:20261016T140000Z"]),
      ),
    );
    expect(events.map((e) => e.title)).toEqual(["(no title)"]);
  });

  it("refuses a file that is not a calendar, in plain words", async () => {
    await expect(read("this is not a calendar")).rejects.toBeInstanceOf(CalendarFileError);
    await expect(read("BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD")).rejects.toThrow(/doesn't look like a calendar/);
    await expect(read("")).rejects.toBeInstanceOf(CalendarFileError);
  });

  it("stops a runaway repeat instead of looping for ever", async () => {
    const { events } = await readCalendar(
      ics(
        vevent([
          "UID:forever",
          "DTSTART:20000101T120000Z",
          "DTEND:20000101T120100Z",
          "RRULE:FREQ=SECONDLY",
          "SUMMARY:Spam",
        ]),
      ),
      RANGE,
    );
    expect(events.length).toBeLessThanOrEqual(3_000); // returns, with a bounded result
  });
});
