import { describe, expect, it } from "vitest";

import { loadNotNow, NOT_NOW_KEY, NOTE_NOT_NOW_KEY, saveNotNow } from "@/lib/day-nav";
import { entriesWithoutNote, needsNote, nextWithoutNote, noteReminder, noteReminderText } from "@/lib/note-later";
import { PENDING_PREFIX } from "@/lib/optimistic-entries";

const e = (id: string, note = "", started_at: string | null = null) => ({ id, note, started_at });

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("log first, note later: which entries still need a note", () => {
  it("counts stopped, confirmed entries whose note is empty or only spaces", () => {
    expect(needsNote(e("a"))).toBe(true);
    expect(needsNote(e("b", "   \n "))).toBe(true);
    expect(needsNote(e("c", "Homepage"))).toBe(false);
    // A running timer is not finished; a row still on its way has no id the server knows.
    expect(needsNote(e("d", "", "2026-10-24T09:00:00Z"))).toBe(false);
    expect(needsNote(e(`${PENDING_PREFIX}x`))).toBe(false);
    expect(entriesWithoutNote([e("a"), e("c", "x"), e("b")]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("Add notes walks forward through the list, then back to one it skipped, then stops", () => {
    const list = [e("a"), e("b", "done"), e("c"), e("d")];
    expect(nextWithoutNote(list, "a")).toBe("c");
    expect(nextWithoutNote(list, "c")).toBe("d");
    // "d" is the last: "a" was skipped (Escape) and still has no note, so the walk goes back to it.
    expect(nextWithoutNote(list, "d")).toBe("a");
    // The saved one never comes back, even before the list has caught up with its new note.
    expect(nextWithoutNote([e("a"), e("b", "x")], "a")).toBeNull();
    expect(nextWithoutNote([], "a")).toBeNull();
  });
});

describe("log first, note later: the day card's reminder", () => {
  const TODAY = "2026-10-24";
  const none = new Set<string>();

  it("shows on today and past days that have entries without a note", () => {
    expect(noteReminder([e("a"), e("b"), e("c", "x")], TODAY, TODAY, none)).toBe(2);
    expect(noteReminder([e("a")], "2026-10-20", TODAY, none)).toBe(1);
  });

  it("stays away from future days, empty days, fully noted days, before today is known and after Not now", () => {
    expect(noteReminder([e("a")], "2026-10-25", TODAY, none)).toBe(0);
    expect(noteReminder([], TODAY, TODAY, none)).toBe(0);
    expect(noteReminder([e("a", "x")], TODAY, TODAY, none)).toBe(0);
    expect(noteReminder([e("a")], TODAY, null, none)).toBe(0);
    expect(noteReminder([e("a")], TODAY, TODAY, new Set([TODAY]))).toBe(0);
  });

  it("says one entry or several in plain words", () => {
    expect(noteReminderText(1)).toBe("1 entry has no note yet.");
    expect(noteReminderText(3)).toBe("3 entries have no note yet.");
  });

  it("Not now reuses the missed-day storage rule under its own key, so the two lines never hide each other", () => {
    const s = memoryStorage();
    saveNotNow(s, TODAY, NOTE_NOT_NOW_KEY);
    expect(loadNotNow(s, NOTE_NOT_NOW_KEY).has(TODAY)).toBe(true);
    expect(loadNotNow(s).has(TODAY)).toBe(false);
    expect(s.getItem(NOT_NOW_KEY)).toBeNull();
  });
});
