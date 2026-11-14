import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { msUntilNextLocalMidnight, watchLocalDate } from "@/lib/local-date-watch";

// Issue 449: a tab left open on Monday evening still said "Today" was Monday on Tuesday morning.
const MONDAY_23 = new Date(2026, 2, 16, 23, 0); // local Monday 16 March 2026, 23:00
const TUESDAY_09 = new Date(2026, 2, 17, 9, 0);
const HOUR = 3_600_000;

function fakeTargets() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  return { win, doc };
}

describe("watchLocalDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MONDAY_23);
  });
  afterEach(() => vi.useRealTimers());

  it("reports the new date when the tab becomes visible after the laptop slept", () => {
    const targets = fakeTargets();
    const onChange = vi.fn();
    const stop = watchLocalDate(onChange, targets);
    vi.setSystemTime(TUESDAY_09); // the clock moved on while no timer ran (asleep)
    targets.doc.dispatchEvent(new Event("visibilitychange"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-03-17");
    stop();
  });

  it("ignores visibilitychange while the tab is hidden", () => {
    const targets = fakeTargets();
    targets.doc.visibilityState = "hidden";
    const onChange = vi.fn();
    const stop = watchLocalDate(onChange, targets);
    vi.setSystemTime(TUESDAY_09);
    targets.doc.dispatchEvent(new Event("visibilitychange"));
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it("reports the new date when the window gets focus", () => {
    const targets = fakeTargets();
    const onChange = vi.fn();
    const stop = watchLocalDate(onChange, targets);
    vi.setSystemTime(TUESDAY_09);
    targets.win.dispatchEvent(new Event("focus"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-03-17");
    stop();
  });

  it("reports the new date at midnight in a tab that stays open, and again the next midnight", () => {
    const onChange = vi.fn();
    const stop = watchLocalDate(onChange, fakeTargets());
    vi.advanceTimersByTime(HOUR - 1); // 23:59:59.999: not yet
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1001); // 00:00:01, one second past midnight
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("2026-03-17");
    vi.advanceTimersByTime(24 * HOUR);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("2026-03-18");
    stop();
  });

  it("stops listening and clears the midnight timeout after cleanup", () => {
    const targets = fakeTargets();
    const onChange = vi.fn();
    const stop = watchLocalDate(onChange, targets);
    stop();
    vi.setSystemTime(TUESDAY_09);
    targets.doc.dispatchEvent(new Event("visibilitychange"));
    targets.win.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(48 * HOUR);
    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("is one hour at 23:00", () => {
    expect(msUntilNextLocalMidnight(MONDAY_23)).toBe(HOUR);
  });

  it("is a full day at exactly midnight, never 0", () => {
    const midnight = new Date(2026, 2, 17, 0, 0, 0, 0);
    const next = new Date(midnight.getTime() + msUntilNextLocalMidnight(midnight));
    expect(next.getTime()).toBe(new Date(2026, 2, 18).getTime());
    expect(msUntilNextLocalMidnight(midnight)).toBeGreaterThan(0);
  });

  // Daylight-saving days in the US (8 March) and the end of US DST (1 November): 23 and 25 hours where the machine has it.
  it.each([
    [new Date(2026, 2, 8, 12, 0), new Date(2026, 2, 9)],
    [new Date(2026, 10, 1, 12, 0), new Date(2026, 10, 2)],
    [new Date(2026, 2, 8, 0, 0), new Date(2026, 2, 9)],
    [new Date(2026, 10, 1, 0, 0), new Date(2026, 10, 2)],
  ])("from %s lands on local 00:00:00 of the next day", (now, expected) => {
    const next = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    expect(next.getTime()).toBe(expected.getTime());
    expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([0, 0, 0]);
  });
});
