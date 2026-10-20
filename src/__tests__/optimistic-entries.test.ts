import { describe, expect, it } from "vitest";

import {
  addEntry,
  type ClientWithProjects,
  type EntryListItem,
  inRange,
  isPendingId,
  patchEntry,
  pendingEntry,
  projectWithClient,
  rangeOfKey,
  removeEntry,
  withNonBillableDay,
} from "@/lib/optimistic-entries";

const WEEK = { from: "2026-10-12", to: "2026-10-18" };

const client = {
  id: "c1",
  name: "Acme",
  color: "#111",
  projects: [
    { id: "p1", name: "Site", hourly_rate: 8500, billable: true },
    { id: "p2", name: "Retainer" },
  ],
} as unknown as ClientWithProjects;

const row = (id: string, date: string, created = "2026-10-12T08:00:00.000Z", over: Partial<EntryListItem> = {}) =>
  ({
    id,
    date,
    minutes: 60,
    note: "",
    created_at: created,
    project_id: "p1",
    non_billable: false,
    ...over,
  }) as EntryListItem;

describe("showing a change before the server confirms it", () => {
  it("adds a new entry to a list covering its day, newest day first and newest entry first within a day", () => {
    const rows = [row("a", "2026-10-14", "2026-10-14T08:00:00.000Z"), row("b", "2026-10-12")];
    const added = addEntry(rows, WEEK, row("new", "2026-10-14", "2026-10-14T09:00:00.000Z"));
    expect(added.map((r) => r.id)).toEqual(["new", "a", "b"]); // same day as "a" but newer, so first
    const older = addEntry(rows, WEEK, row("old", "2026-10-14", "2026-10-14T07:00:00.000Z"));
    expect(older.map((r) => r.id)).toEqual(["a", "old", "b"]);
    expect(addEntry(rows, WEEK, row("later", "2026-10-20")).map((r) => r.id)).toEqual(["a", "b"]); // outside this list
    expect(addEntry(rows, WEEK, row("a", "2026-10-14")).map((r) => r.id)).toEqual(["a", "b"]); // never twice
  });

  it("changes a row in place, moves it out of a list when its new day is outside it, and leaves other lists alone", () => {
    const rows = [row("a", "2026-10-14"), row("b", "2026-10-12")];
    expect(patchEntry(rows, WEEK, "a", { minutes: 180, note: "longer" })[0]).toMatchObject({
      minutes: 180,
      note: "longer",
    });
    expect(patchEntry(rows, WEEK, "a", { date: "2026-10-16" }).find((r) => r.id === "a")?.date).toBe("2026-10-16");
    expect(patchEntry(rows, WEEK, "a", { date: "2026-10-25" }).map((r) => r.id)).toEqual(["b"]); // moved to next week
    expect(patchEntry(rows, WEEK, "zzz", { minutes: 1 })).toBe(rows); // not in this list: untouched
  });

  it("removes a row, and returns the same list when it is not there", () => {
    const rows = [row("a", "2026-10-14"), row("b", "2026-10-12")];
    expect(removeEntry(rows, "a").map((r) => r.id)).toEqual(["b"]);
    expect(removeEntry(rows, "nope")).toBe(rows);
  });

  it("reads the days a cached list covers from its query key, and ignores keys that name none", () => {
    expect(rangeOfKey([["entry", "list"], { input: WEEK, type: "query" }])).toEqual(WEEK);
    expect(rangeOfKey([["entry", "list"], { input: { from: "", to: "" }, type: "query" }])).toBeNull();
    expect(rangeOfKey([["entry", "list"]])).toBeNull();
    expect(rangeOfKey([["entry", "list"], { type: "query" }])).toBeNull();
    expect(inRange("2026-10-12", WEEK) && inRange("2026-10-18", WEEK) && !inRange("2026-10-19", WEEK)).toBe(true);
  });

  it("marks and un-marks a day in a marked-days list, only when the day is inside it, oldest first", () => {
    expect(withNonBillableDay(["2026-10-16"], WEEK, "2026-10-13", true)).toEqual(["2026-10-13", "2026-10-16"]);
    expect(withNonBillableDay(["2026-10-13", "2026-10-16"], WEEK, "2026-10-13", false)).toEqual(["2026-10-16"]);
    expect(withNonBillableDay(["2026-10-13"], WEEK, "2026-10-13", true)).toEqual(["2026-10-13"]); // never twice
    expect(withNonBillableDay([], WEEK, "2026-11-01", true)).toEqual([]);
  });

  it("builds the row for a just-typed entry from the project and client already on screen", () => {
    const made = pendingEntry({
      clientId: "abc",
      userId: "u1",
      client,
      projectId: "p1",
      date: "2026-10-14",
      minutes: 90,
      note: "hero",
      nonBillable: false,
    });
    expect(made).toMatchObject({
      id: "pending-abc",
      user_id: "u1",
      project_id: "p1",
      minutes: 90,
      note: "hero",
      author: null,
      project: { name: "Site", client: { name: "Acme" } },
    });
    expect(made && "projects" in made.project.client).toBe(false); // the client carries no project list
    expect(isPendingId(made?.id ?? "")).toBe(true);
    expect(isPendingId("0b4c-real-id")).toBe(false);
    // a project that is not in the list cannot be shown, so nothing is invented
    expect(
      pendingEntry({
        clientId: "x",
        userId: "u1",
        client,
        projectId: "gone",
        date: "2026-10-14",
        minutes: 1,
        note: "",
        nonBillable: false,
      }),
    ).toBeNull();
    expect(projectWithClient([client], "p2")?.client.name).toBe("Acme");
    expect(projectWithClient(undefined, "p1")).toBeNull();
  });
});
