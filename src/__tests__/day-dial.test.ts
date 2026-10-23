import { describe, expect, it } from "vitest";

import { runningMinutes } from "@/lib/day-dial";

describe("a running timer counts into the day's totals", () => {
  it("adds its minutes to what is logged, and nothing once it is stopped", () => {
    const started = new Date("2026-10-22T09:00:00Z");
    const at = new Date("2026-10-22T10:30:30Z").getTime();
    const logged = 3 * 60; // three hours already logged today
    expect(logged + runningMinutes(started, at)).toBe(270);
    expect(logged + runningMinutes(null, at)).toBe(180);
  });

  it("counts whole minutes, nothing before the start, and a forgotten timer at most a day (as the server banks it)", () => {
    const started = "2026-10-22T09:00:00Z";
    expect(runningMinutes(started, new Date("2026-10-22T09:00:59Z").getTime())).toBe(0);
    expect(runningMinutes(started, new Date("2026-10-22T09:01:00Z").getTime())).toBe(1);
    expect(runningMinutes(started, new Date("2026-10-22T08:00:00Z").getTime())).toBe(0); // clock skew: a start in the future
    expect(runningMinutes(started, new Date("2026-10-26T09:00:00Z").getTime())).toBe(24 * 60);
    expect(runningMinutes(undefined, Date.now())).toBe(0);
    expect(runningMinutes("not a date", Date.now())).toBe(0);
  });
});
