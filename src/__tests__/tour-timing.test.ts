import { describe, expect, it } from "vitest";

import { ease, nextIndex, scrollDistance, scrollDuration, TOUR_MIN_SCROLL_MS, TOUR_MS_PER_PX } from "@/lib/tour-timing";

describe("the landing page tour's pacing", () => {
  it("scrolls only as far as a picture is taller than its window, and not at all when it fits", () => {
    expect(scrollDistance(1240, 700)).toBe(540);
    expect(scrollDistance(600, 700)).toBe(0);
    expect(scrollDistance(700, 700)).toBe(0);
    expect(scrollDistance(0, 0)).toBe(0);
  });

  it("scrolls slowly enough to read: a minimum time, and longer for a longer page", () => {
    expect(scrollDuration(100)).toBe(TOUR_MIN_SCROLL_MS);
    expect(scrollDuration(2000)).toBe(2000 * TOUR_MS_PER_PX);
    expect(scrollDuration(2000)).toBeGreaterThan(scrollDuration(1000));
  });

  it("goes round: after the last page comes the first, and an empty tour stays at zero", () => {
    expect(nextIndex(0, 6)).toBe(1);
    expect(nextIndex(5, 6)).toBe(0);
    expect(nextIndex(0, 1)).toBe(0);
    expect(nextIndex(3, 0)).toBe(0);
  });

  it("eases in and out between 0 and 1, slow at both ends and fast in the middle", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
  });
});
