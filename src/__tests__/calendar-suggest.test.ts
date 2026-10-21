import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/calendar-events";
import { eventId, guessProject, suggestionsForDay } from "@/lib/calendar-suggest";

const PROJECTS = [
  { id: "p-site", name: "Website redesign", clientName: "Acme" },
  { id: "p-app", name: "Mobile app", clientName: "Acme" },
  { id: "p-solo", name: "Brand refresh", clientName: "Fernhill" },
  { id: "p-gen", name: "General", clientName: "Offline Co" },
];
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).getTime(); // local time, as the browser reads it
const ev = (uid: string, title: string, day: string, from: string, to: string): CalendarEvent => ({
  uid,
  title,
  start: at(day, from),
  end: at(day, to),
});

describe("which project a meeting title points at", () => {
  it("prefers a project's own name, then a client with one project, and leaves the rest to the person", () => {
    expect(guessProject("Weekly website redesign review", PROJECTS)).toBe("p-site");
    expect(guessProject("Fernhill check-in", PROJECTS)).toBe("p-solo"); // a client with a single project
    expect(guessProject("Acme call", PROJECTS)).toBeNull(); // Acme has two projects: ambiguous
    expect(guessProject("Dentist", PROJECTS)).toBeNull();
    expect(guessProject("Mobile app and website redesign sync", PROJECTS)).toBeNull(); // names two different projects
    expect(guessProject("Acme: mobile app", PROJECTS)).toBe("p-app"); // the project's name settles what the client's could not
  });

  it("matches whole words only, ignoring case and punctuation", () => {
    expect(guessProject("ACME: mobile-app standup!", PROJECTS)).toBe("p-app");
    expect(guessProject("Fernhillside barbecue", PROJECTS)).toBeNull();
    expect(guessProject("Generalized chat", PROJECTS)).toBeNull();
    const nested = [
      { id: "p1", name: "App", clientName: "X" },
      { id: "p2", name: "Mobile app", clientName: "Y" },
    ];
    expect(guessProject("Mobile app sync", nested)).toBe("p2"); // "app" is only part of "mobile app"
  });
});

describe("the suggestions for a day", () => {
  const day = "2026-10-15";
  const events = [
    ev("a", "Acme website redesign sync", day, "10:00", "10:45"),
    ev("b", "Lunch with Sam", day, "12:00", "13:00"),
    ev("c", "Fernhill check-in", day, "15:30", "16:00"),
    ev("d", "Yesterday's thing", "2026-10-14", "10:00", "11:00"),
    ev("e", "Tomorrow's thing", "2026-10-16", "10:00", "11:00"),
    ev("f", "Offsite block", day, "08:00", "20:00"), // 12 hours: a block, not a meeting
  ];

  it("lists only that day's meetings, in time order, with minutes and the guessed project", () => {
    const s = suggestionsForDay(events, day, PROJECTS, [], new Set());
    expect(s.map((x) => [x.title, x.minutes, x.projectId])).toEqual([
      ["Acme website redesign sync", 45, "p-site"],
      ["Lunch with Sam", 60, null],
      ["Fernhill check-in", 30, "p-solo"],
    ]);
  });

  it("hides what is already logged (same description and length that day) and what was skipped", () => {
    const s = suggestionsForDay(
      events,
      day,
      PROJECTS,
      [{ note: "acme website redesign sync", minutes: 45 }],
      new Set([eventId(events[1])]),
    );
    expect(s.map((x) => x.title)).toEqual(["Fernhill check-in"]);
    // the same title with a different length is a different entry and stays
    const kept = suggestionsForDay(events, day, PROJECTS, [{ note: "Fernhill check-in", minutes: 15 }], new Set());
    expect(kept.map((x) => x.title)).toContain("Fernhill check-in");
  });

  it("offers an event once even if the file listed it twice, and rounds odd lengths to the minute", () => {
    const dup = [ev("z", "Standup", day, "09:00", "09:15"), ev("z", "Standup", day, "09:00", "09:15")];
    expect(suggestionsForDay(dup, day, PROJECTS, [], new Set())).toHaveLength(1);
    const odd = [{ uid: "o", title: "Quick", start: at(day, "09:00"), end: at(day, "09:00") + 29_400 }]; // 29.4 s
    expect(suggestionsForDay(odd, day, PROJECTS, [], new Set())[0].minutes).toBe(1);
  });
});
