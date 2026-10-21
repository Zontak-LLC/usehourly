import { describe, expect, it } from "vitest";

import { addSkipped, forgetCalendar, keepWindow, loadCalendar, loadSkipped, saveCalendar } from "@/lib/calendar-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
const EVENTS = [{ uid: "a", title: "Acme sync", start: 1_000, end: 2_000 }];

describe("the imported calendar kept on this device", () => {
  it("is readable only by the account that imported it, and gone after forgetting", () => {
    const s = fakeStorage();
    expect(saveCalendar(s, "u1", { name: "work.ics", events: EVENTS, importedAt: 5 })).toBe(true);
    expect(loadCalendar(s, "u1")).toMatchObject({ name: "work.ics", importedAt: 5, events: EVENTS });
    expect(loadCalendar(s, "u2")).toBeNull();
    expect(loadCalendar(s, null)).toBeNull();
    forgetCalendar(s);
    expect(loadCalendar(s, "u1")).toBeNull();
  });

  it("ignores anything damaged or not shaped like a calendar", () => {
    for (const bad of [
      "not json",
      "{}",
      JSON.stringify({ userId: "u1", importedAt: 1, name: "x", events: [{ title: 1 }] }),
    ]) {
      expect(loadCalendar(fakeStorage({ "hourly:calendar": bad }), "u1")).toBeNull();
    }
  });

  it("refuses an import that is too big, and survives storage that refuses or throws", () => {
    const big = Array.from({ length: 3_000 }, (_, i) => ({
      uid: `${"u".repeat(300)}${i}`,
      title: "x".repeat(190),
      start: i,
      end: i + 1,
    }));
    expect(saveCalendar(fakeStorage(), "u1", { name: "n", events: big, importedAt: 1 })).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(saveCalendar(throwing, "u1", { name: "n", events: EVENTS, importedAt: 1 })).toBe(false);
    expect(loadCalendar(throwing, "u1")).toBeNull();
    expect(() => forgetCalendar(throwing)).not.toThrow();
  });

  it("remembers skipped meetings per account, newest 500 kept, and forgets them with the calendar", () => {
    const s = fakeStorage();
    addSkipped(s, "u1", "a@1");
    addSkipped(s, "u1", "b@2");
    expect([...loadSkipped(s, "u1")]).toEqual(["a@1", "b@2"]);
    expect(loadSkipped(s, "u2").size).toBe(0);
    for (let i = 0; i < 600; i++) addSkipped(s, "u1", `x${i}@${i}`);
    const kept = loadSkipped(s, "u1");
    expect(kept.size).toBe(500);
    expect(kept.has("x599@599")).toBe(true);
    expect(kept.has("a@1")).toBe(false);
    forgetCalendar(s);
    expect(loadSkipped(s, "u1").size).toBe(0);
  });

  it("keeps the last 90 days and the next day or two", () => {
    const now = new Date(2026, 9, 20, 15, 30);
    const { from, to } = keepWindow(now);
    expect(from.getFullYear()).toBe(2026);
    expect(Math.round((now.getTime() - from.getTime()) / 86_400_000)).toBe(91);
    expect(to.getDate()).toBe(22);
  });
});
