import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SPINNER_DELAY_MS, scheduleDelayedShow } from "@/lib/loading-delay";

describe("scheduleDelayedShow: the spinner shows only after a wait long enough to notice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never shows for a fast answer (cancelled at 299 ms)", () => {
    const onShow = vi.fn();
    const cancel = scheduleDelayedShow({ delayMs: SPINNER_DELAY_MS, onShow });
    vi.advanceTimersByTime(SPINNER_DELAY_MS - 1);
    cancel();
    vi.advanceTimersByTime(SPINNER_DELAY_MS * 10);
    expect(onShow).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows exactly once at 300 ms for a slow answer", () => {
    const onShow = vi.fn();
    scheduleDelayedShow({ delayMs: SPINNER_DELAY_MS, onShow });
    vi.advanceTimersByTime(SPINNER_DELAY_MS - 1);
    expect(onShow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onShow).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SPINNER_DELAY_MS * 10);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("does nothing more when cancelled after it showed", () => {
    const onShow = vi.fn();
    const cancel = scheduleDelayedShow({ delayMs: SPINNER_DELAY_MS, onShow });
    vi.advanceTimersByTime(SPINNER_DELAY_MS);
    cancel();
    vi.advanceTimersByTime(SPINNER_DELAY_MS * 10);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("waits 300 ms", () => {
    expect(SPINNER_DELAY_MS).toBe(300);
  });
});
