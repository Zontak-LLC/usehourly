import { describe, expect, it } from "vitest";

import { quickCreateMinutes } from "@/app/(main)/dashboard/month/_components/quick-create-gate";
import { readTypedDuration } from "@/lib/typed-duration";

// Month's several-days panel is hidden while FEATURES.multiDay is off, so its e2e case is skipped; this pins when
// its Create button is on.
const form = (duration: string, dayCount = 1, projectId = "p1") => ({
  dayCount,
  projectId,
  read: readTypedDuration(duration),
});

describe("the several-days panel turns Create on only for time it can log", () => {
  it.each([
    ["25"], // a bare 25 gets "Did you mean 25 minutes? Type 25m"
    ["0"], // "Enter more than 0, like 1:30"
    ["abc"],
    [""],
  ])("keeps Create off for %j", (duration) => {
    expect(quickCreateMinutes(form(duration))).toBeUndefined();
  });

  it("creates two hours on each day for a bare 2, and 25 minutes for 25m", () => {
    expect(quickCreateMinutes(form("2"))).toBe(120);
    expect(quickCreateMinutes(form("25m"))).toBe(25);
  });

  it("keeps Create off with no day picked or no project, even for a good time", () => {
    expect(quickCreateMinutes(form("2", 0))).toBeUndefined();
    expect(quickCreateMinutes(form("2", 3, ""))).toBeUndefined();
  });
});
