import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/calendar-events";
import { CALENDAR_RULES_KEY, forgetCalendar, loadRules, saveRules } from "@/lib/calendar-store";
import {
  addRule,
  type CalendarRule,
  MAX_RULES,
  ruleProject,
  ruleToOffer,
  ruleWordFor,
  suggestionsForDay,
} from "@/lib/calendar-suggest";

/**
 * Issue 99: "events containing X go to project X". A person picks a project for a meeting by hand, is offered a rule,
 * taps Always, and the next meeting with that word comes with the project already picked. Rules live in this browser,
 * per account, and go with the calendar.
 */
const PROJECTS = [
  { id: "p-design", name: "Design", clientName: "Acme" },
  { id: "p-dev", name: "Development", clientName: "Acme" },
  { id: "p-brand", name: "Brand refresh", clientName: "Fernhill" },
];
const day = "2026-10-15";
const at = (hhmm: string) => new Date(`${day}T${hhmm}:00`).getTime();
const ev = (uid: string, title: string, from: string, to: string): CalendarEvent => ({
  uid,
  title,
  start: at(from),
  end: at(to),
});

function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("a meeting rule, from the first hand pick to the next week's meeting", () => {
  it("offers a rule after a hand pick, then pre-picks the project for every meeting with that word", () => {
    const storage = fakeStorage();
    const monday = [ev("m1", "Acme weekly sync", "10:00", "10:30")];

    // 1. Acme has two projects, so nothing is guessed and the person picks Design.
    const [first] = suggestionsForDay(monday, day, PROJECTS, [], new Set(), loadRules(storage, "u1"));
    expect(first.projectId).toBeNull();
    expect(first.rule).toBeNull();

    // 2. After Add, the offer names the telling word, not "weekly" or "sync".
    const word = ruleToOffer(first.title, "p-design", first.projectId, loadRules(storage, "u1"));
    expect(word).toBe("acme");

    // 3. One tap on Always keeps it for this account.
    expect(saveRules(storage, "u1", addRule(loadRules(storage, "u1"), { word: "acme", projectId: "p-design" }))).toBe(
      true,
    );

    // 4. Next time, every Acme meeting comes with Design picked, and says why.
    const later = [
      ev("m2", "ACME: roadmap review", "09:00", "09:45"),
      ev("m3", "Lunch with Sam", "12:00", "13:00"),
      ev("m4", "Acmeville trip", "14:00", "15:00"), // not the whole word
    ];
    const s = suggestionsForDay(later, day, PROJECTS, [], new Set(), loadRules(storage, "u1"));
    expect(s.map((x) => [x.title, x.projectId, x.rule])).toEqual([
      ["ACME: roadmap review", "p-design", "acme"],
      ["Lunch with Sam", null, null],
      ["Acmeville trip", null, null],
    ]);

    // 5. Picking the same project again offers nothing more; picking another one offers to change the rule.
    expect(ruleToOffer("Acme planning", "p-design", "p-design", loadRules(storage, "u1"))).toBeNull();
    expect(ruleToOffer("Acme planning", "p-design", null, loadRules(storage, "u1"))).toBeNull(); // already the rule
    expect(ruleToOffer("Acme planning", "p-dev", "p-design", loadRules(storage, "u1"))).toBe("acme");
  });

  it("a person's rule beats the guess from names, and a rule for a project that is gone is ignored", () => {
    const rules: CalendarRule[] = [{ word: "fernhill", projectId: "p-dev" }];
    const [s] = suggestionsForDay(
      [ev("f", "Fernhill check-in", "15:00", "15:30")],
      day,
      PROJECTS,
      [],
      new Set(),
      rules,
    );
    expect(s.projectId).toBe("p-dev"); // the name alone would have guessed p-brand
    const gone = suggestionsForDay(
      [ev("f", "Fernhill check-in", "15:00", "15:30")],
      day,
      PROJECTS.filter((p) => p.id !== "p-dev"),
      [],
      new Set(),
      rules,
    );
    expect(gone[0].projectId).toBe("p-brand"); // back to the guess
    expect(gone[0].rule).toBeNull();
  });

  it("the longest matching word wins, then the newest rule", () => {
    const ids = new Set(PROJECTS.map((p) => p.id));
    const rules = addRule(addRule([], { word: "acme", projectId: "p-design" }), {
      word: "acme dev",
      projectId: "p-dev",
    });
    expect(ruleProject("Acme dev standup", rules, ids)?.projectId).toBe("p-dev");
    expect(ruleProject("Acme standup", rules, ids)?.projectId).toBe("p-design");
    const replaced = addRule(rules, { word: "Acme", projectId: "p-brand" }); // same word: replaced, not doubled
    expect(replaced.filter((r) => r.word === "acme")).toEqual([{ word: "acme", projectId: "p-brand" }]);
    expect(ruleProject("Acme standup", replaced, ids)?.projectId).toBe("p-brand");
  });

  it("picks a telling word, falls back to the whole title, and offers nothing for an empty one", () => {
    expect(ruleWordFor("Weekly sync with Northwind")).toBe("northwind");
    expect(ruleWordFor("Daily standup")).toBe("daily standup");
    expect(ruleWordFor("1:1")).toBeNull();
    expect(ruleToOffer("   ", "p-design", null, [])).toBeNull();
    expect(ruleToOffer("Acme", "", null, [])).toBeNull(); // no project chosen
  });

  it("keeps rules per account, refuses damaged ones, caps them, and forgets them with the calendar", () => {
    const storage = fakeStorage();
    saveRules(storage, "u1", [{ word: "acme", projectId: "p-design" }]);
    expect(loadRules(storage, "u2")).toEqual([]); // another account on this browser never sees them
    expect(loadRules(storage, null)).toEqual([]);
    expect(loadRules(fakeStorage({ [CALENDAR_RULES_KEY]: "not json" }), "u1")).toEqual([]);
    expect(
      loadRules(fakeStorage({ [CALENDAR_RULES_KEY]: JSON.stringify({ userId: "u1", rules: [{}] }) }), "u1"),
    ).toEqual([]);

    let many: CalendarRule[] = [];
    for (let i = 0; i < MAX_RULES + 5; i++) many = addRule(many, { word: `client${i}`, projectId: "p-design" });
    expect(many).toHaveLength(MAX_RULES);
    expect(many[0].word).toBe("client5"); // the oldest dropped first

    saveRules(storage, "u1", []);
    expect(storage.data.has(CALENDAR_RULES_KEY)).toBe(false);
    saveRules(storage, "u1", [{ word: "acme", projectId: "p-design" }]);
    forgetCalendar(storage); // Remove calendar
    expect(loadRules(storage, "u1")).toEqual([]);
  });
});
