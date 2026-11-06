import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { SPINNER_DELAY_MS } from "@/lib/loading";

import { mount } from "./helpers/hook-runtime";

// The hook's own useState and useEffect run on the small stand-in (node has no DOM to mount into).
vi.mock("react", async (real) => ({
  ...(await real<object>()),
  ...(await import("./helpers/hook-runtime")).hookRuntime,
}));

/** The hook as a component that holds a flag: `active` is the save still being open. */
const flag = (active: boolean) => mount((p: { active: boolean }) => useDelayedFlag(p.active), { active });

describe("useDelayedFlag: a spinner only for waits long enough to notice (issue 430)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits 300 ms by default", () => {
    expect(SPINNER_DELAY_MS).toBe(300);
  });

  it("is false for the first 299 ms of a wait and true at 300 ms", () => {
    const view = flag(true);
    expect(view.value).toBe(false);
    vi.advanceTimersByTime(299);
    expect(view.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(view.value).toBe(true);
  });

  it("is false at once when the wait ends", () => {
    const view = flag(true);
    vi.advanceTimersByTime(500);
    expect(view.value).toBe(true);
    view.rerender({ active: false });
    expect(view.value).toBe(false);
  });

  it("is never true for a wait of 200 ms", () => {
    const view = flag(true);
    vi.advanceTimersByTime(200);
    view.rerender({ active: false });
    vi.advanceTimersByTime(1000);
    expect(view.value).toBe(false);
  });

  it("starts the timer over: 200 ms, a break, then 200 ms again stays false", () => {
    const view = flag(true);
    vi.advanceTimersByTime(200);
    view.rerender({ active: false });
    view.rerender({ active: true });
    vi.advanceTimersByTime(200);
    expect(view.value).toBe(false);
    vi.advanceTimersByTime(100);
    expect(view.value).toBe(true); // 300 ms after the second start
  });

  it("stops its timer when the component goes", () => {
    const view = flag(true);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes another delay when given one", () => {
    const view = mount((p: { active: boolean }) => useDelayedFlag(p.active, 1000), { active: true });
    vi.advanceTimersByTime(999);
    expect(view.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(view.value).toBe(true);
  });
});
