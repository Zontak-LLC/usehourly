import { describe, expect, it } from "vitest";

import { swipeDirection, swipePages, swipeTarget } from "@/lib/swipe-nav";

const swipe = (pathname: string, over: Partial<Parameters<typeof swipeTarget>[0]> = {}) =>
  swipeTarget({ pathname, dx: -150, dy: 10, ms: 220, startX: 300, width: 412, ...over });

describe("swiping through the tab bar's pages", () => {
  it("walks forward with left swipes and back with right swipes, in the order of the tab buttons", () => {
    const forward = [
      "/dashboard/today",
      "/dashboard/week",
      "/dashboard/month",
      "/dashboard/invoices",
      "/dashboard/clients",
    ];
    for (let i = 0; i < forward.length - 1; i++) expect(swipe(forward[i])).toBe(forward[i + 1]);
    for (let i = forward.length - 1; i > 0; i--) expect(swipe(forward[i], { dx: 150 })).toBe(forward[i - 1]);
  });

  it("stops at either end instead of wrapping around", () => {
    expect(swipe("/dashboard/today", { dx: 150 })).toBeNull(); // right swipe on the first tab
    expect(swipe("/dashboard/clients")).toBeNull(); // left swipe on the last tab of a narrow phone
  });

  it("adds Account after Clients on a phone 480px wide or more, as the tab bar does", () => {
    expect(swipePages(412)).not.toContain("/dashboard/account");
    expect(swipe("/dashboard/clients", { width: 500, startX: 300 })).toBe("/dashboard/account");
    expect(swipe("/dashboard/account", { width: 500, dx: 150, startX: 300 })).toBe("/dashboard/clients");
    expect(swipe("/dashboard/account", { width: 500 })).toBeNull();
  });

  it("ignores gestures that are not a deliberate sideways swipe", () => {
    expect(swipe("/dashboard/week", { dx: -60 })).toBeNull(); // too short
    expect(swipe("/dashboard/week", { dx: -150, dy: 120 })).toBeNull(); // a scroll that drifted sideways
    expect(swipe("/dashboard/week", { ms: 1500 })).toBeNull(); // a slow drag
    expect(swipe("/dashboard/week", { startX: 10 })).toBeNull(); // the system's back gesture owns the left edge
    expect(swipe("/dashboard/week", { startX: 405 })).toBeNull(); // and the right edge
  });

  it("does nothing on pages that are not tabs", () => {
    for (const path of [
      "/dashboard/invoices/new",
      "/dashboard/report",
      "/dashboard/team",
      "/dashboard/insights",
      "/help",
    ]) {
      expect(swipe(path)).toBeNull();
    }
  });

  it("treats a trailing slash like the page itself", () => {
    expect(swipe("/dashboard/week/")).toBe("/dashboard/month");
  });
});

describe("a swipe inside a page area (a day, a month, a meeting)", () => {
  const dir = (over: Partial<Parameters<typeof swipeDirection>[0]> = {}) =>
    swipeDirection({ dx: -150, dy: 10, ms: 220, startX: 300, width: 412, ...over });

  it("says left or right when the gesture is a real swipe", () => {
    expect(dir()).toBe("left");
    expect(dir({ dx: 150 })).toBe("right");
  });

  it("says nothing for a short move, a scroll, a slow drag or a start at the screen's edge", () => {
    expect(dir({ dx: -60 })).toBeNull();
    expect(dir({ dx: -150, dy: 120 })).toBeNull();
    expect(dir({ ms: 900 })).toBeNull();
    expect(dir({ startX: 10 })).toBeNull();
    expect(dir({ startX: 400 })).toBeNull();
  });

  it("is the same gate the tab swipe uses, so the two cannot disagree", () => {
    for (const over of [{}, { dx: -60 }, { ms: 900 }, { startX: 10 }, { dx: 150 }]) {
      const moved = swipeTarget({
        pathname: "/dashboard/week",
        dx: -150,
        dy: 10,
        ms: 220,
        startX: 300,
        width: 412,
        ...over,
      });
      const direction = dir(over);
      expect(moved === null).toBe(direction === null);
    }
  });
});
