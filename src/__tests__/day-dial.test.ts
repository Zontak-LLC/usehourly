import { describe, expect, it } from "vitest";

import { DAY_GOAL_MINUTES, dialFraction, dialLeft } from "@/lib/day-dial";

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
});
