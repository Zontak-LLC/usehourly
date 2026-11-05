import { describe, expect, it } from "vitest";

import { loadCalendar, loadGoogle, loadLink, loadRules, loadSkipped } from "@/lib/calendar-store";
import { NOTE_MAX } from "@/lib/notes";
import { PENDING_KEY, readPending } from "@/lib/offline-queue";
import { isFields, isListUpTo, isNumber, isText, isWholeIn } from "@/lib/stored-guards";

/**
 * The hand-written checks that replaced zod for data this browser saved (issue 425). Each rule the zod schema had is
 * broken once (wrong type, too long, missing field, ...) and one good value is accepted, so a looser or stricter check
 * fails here: a looser one keeps bad data, a stricter one drops a person's unsynced entries.
 */
function storage(values: Record<string, unknown>) {
  const data = new Map(Object.entries(values).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("the small checks", () => {
  it("match zod's object, string, number, int and array rules", () => {
    expect([isFields({}), isFields(null), isFields([]), isFields("x")]).toEqual([true, false, false, false]);
    expect([isText("ab", 1, 2), isText("", 1), isText("abc", 0, 2), isText(1)]).toEqual([true, false, false, false]);
    expect([isNumber(1.5), isNumber(Number.NaN), isNumber(Number.POSITIVE_INFINITY), isNumber("1")]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect([isWholeIn(3, 1, 3), isWholeIn(1.5, 1, 3), isWholeIn(0, 1, 3), isWholeIn(4, 1, 3)]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect([isListUpTo([1, 2], 2), isListUpTo([1, 2, 3], 2), isListUpTo({ length: 0 }, 2)]).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("an entry waiting offline", () => {
  const good = {
    clientId: "11111111-1111-4111-8111-111111111111",
    userId: "u1",
    projectId: "p1",
    date: "2026-11-04",
    minutes: 90,
    note: "Design",
    createdAt: 1_700_000_000_000,
  };
  const read = (item: unknown) => readPending(storage({ [PENDING_KEY]: [item] }));

  it("is kept when every rule holds, with only the known fields (as zod returned them)", () => {
    expect(read(good)).toEqual([good]);
    expect(read([good])).toEqual([]); // a list is not an entry
    expect(read({ ...good, error: "Project deleted", extra: 1 })).toEqual([{ ...good, error: "Project deleted" }]);
    expect(read({ ...good, minutes: 24 * 60, note: "x".repeat(NOTE_MAX) })).toHaveLength(1);
    expect(read({ ...good, clientId: "00000000-0000-0000-0000-000000000000" })).toHaveLength(1);
  });

  it.each([
    ["clientId not a uuid", { clientId: "abc" }],
    ["clientId with a bad version digit", { clientId: "11111111-1111-9111-8111-111111111111" }],
    ["clientId a number", { clientId: 1 }],
    ["userId empty", { userId: "" }],
    ["projectId missing", { projectId: undefined }],
    ["date not YYYY-MM-DD", { date: "2026/11/04" }],
    ["minutes zero", { minutes: 0 }],
    ["minutes over a day", { minutes: 24 * 60 + 1 }],
    ["minutes not whole", { minutes: 1.5 }],
    ["minutes text", { minutes: "90" }],
    ["note too long", { note: "x".repeat(NOTE_MAX + 1) }],
    ["note missing", { note: undefined }],
    ["createdAt text", { createdAt: "today" }],
    ["error not text", { error: 1 }],
  ])("is dropped when %s", (_name, change) => {
    expect(read({ ...good, ...change })).toEqual([]);
  });
});

describe("the calendar kept on this device", () => {
  const event = { uid: "a", title: "Acme sync", start: 1_000, end: 2_000 };
  const calendar = { userId: "u1", importedAt: 5, name: "work.ics", events: [event] };
  const load = (value: unknown) => loadCalendar(storage({ "hourly:calendar": value }), "u1");

  it("loads a good calendar with only the known fields", () => {
    expect(load({ ...calendar, extra: 1, events: [{ ...event, extra: 2 }] })).toEqual(calendar);
  });

  it.each([
    ["userId empty", { userId: "" }],
    ["importedAt missing", { importedAt: undefined }],
    ["name too long", { name: "x".repeat(201) }],
    ["events not a list", { events: {} }],
    ["too many events", { events: Array.from({ length: 3_001 }, () => event) }],
    ["an event uid too long", { events: [{ ...event, uid: "u".repeat(401) }] }],
    ["an event title too long", { events: [{ ...event, title: "t".repeat(201) }] }],
    ["an event start text", { events: [{ ...event, start: "9am" }] }],
    ["an event end missing", { events: [{ ...event, end: undefined }] }],
  ])("drops it when %s", (_name, change) => {
    expect(load({ ...calendar, ...change })).toBeNull();
  });

  it("reads the link, the Google mark, the skipped list and the rules only when each rule holds", () => {
    const at = (key: string, value: unknown) => storage({ [key]: value });
    expect(loadLink(at("hourly:calendarLink", { userId: "u1", url: "https://x" }), "u1")).toBe("https://x");
    expect(loadLink(at("hourly:calendarLink", { userId: "u1", url: "x".repeat(2001) }), "u1")).toBeNull();
    expect(loadLink(at("hourly:calendarLink", { userId: 1, url: "https://x" }), "u1")).toBeNull();

    expect(loadGoogle(at("hourly:calendarGoogle", { userId: "u1" }), "u1")).toBe(true);
    expect(loadGoogle(at("hourly:calendarGoogle", { userId: "u2" }), "u1")).toBe(false);

    expect(loadSkipped(at("hourly:calendarSkipped", { userId: "u1", ids: ["a", "b"] }), "u1")).toEqual(
      new Set(["a", "b"]),
    );
    expect(loadSkipped(at("hourly:calendarSkipped", { userId: "u1", ids: ["x".repeat(501)] }), "u1").size).toBe(0);
    expect(loadSkipped(at("hourly:calendarSkipped", { userId: "u1", ids: Array(501).fill("a") }), "u1").size).toBe(0);
    expect(loadSkipped(at("hourly:calendarSkipped", { userId: "u1", ids: [1] }), "u1").size).toBe(0);

    const rule = { word: "acme", projectId: "p1" };
    const rules = (list: unknown) => loadRules(at("hourly:calendarRules", { userId: "u1", rules: list }), "u1");
    expect(rules([{ ...rule, extra: 1 }])).toEqual([rule]);
    expect(rules([{ ...rule, word: "" }])).toEqual([]);
    expect(rules([{ ...rule, word: "w".repeat(61) }])).toEqual([]);
    expect(rules([{ ...rule, projectId: "p".repeat(101) }])).toEqual([]);
    expect(rules([{ word: "acme" }])).toEqual([]);
    expect(rules(Array(101).fill(rule))).toEqual([]);
  });
});
