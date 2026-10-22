import { describe, expect, it } from "vitest";

import { DAY_GOAL_MINUTES, dialFraction, dialLeft, runningMinutes } from "@/lib/day-dial";

describe("the day dial: how full the ring is and what is left", () => {
  it("fills with the hours logged against an eight hour goal", () => {
    expect(dialFraction(0)).toBe(0);
    expect(dialFraction(240)).toBe(0.5);
    expect(dialFraction(DAY_GOAL_MINUTES)).toBe(1);
  });

  it("never wraps past full, and never goes below empty or breaks on bad input", () => {
    expect(dialFraction(900)).toBe(1);
    expect(dialFraction(-30)).toBe(0);
    expect(dialFraction(Number.NaN)).toBe(0);
    expect(dialFraction(60, 0)).toBe(0);
  });

  it("says what is left in hours and minutes, then that the goal is reached", () => {
    expect(dialLeft(330)).toBe("2:30 to go");
    expect(dialLeft(0)).toBe("8:00 to go");
    expect(dialLeft(480)).toBe("goal reached");
    expect(dialLeft(600)).toBe("goal reached");
  });

  it("one clock for the day: a running timer adds its minutes to the logged total, so the ring and the 'to go' move with it", () => {
    const started = new Date("2026-10-22T09:00:00Z");
    const at = (hh: number, mm: number) =>
      new Date(`2026-10-22T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:30Z`).getTime();
    const logged = 3 * 60; // three hours already logged today
    // 90 minutes into the timer: 4:30 in the middle, half way round the ring would be 4:00, so a bit past it.
    const total = logged + runningMinutes(started, at(10, 30));
    expect(total).toBe(270);
    expect(dialFraction(total)).toBeCloseTo(270 / 480);
    expect(dialLeft(total)).toBe("3:30 to go");
    // Stopped: no timer, the dial falls back to what is logged.
    expect(logged + runningMinutes(null, at(10, 30))).toBe(180);
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
