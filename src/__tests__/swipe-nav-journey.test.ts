import { describe, expect, it } from "vitest";

import { swipePages, swipeTarget } from "@/lib/swipe-nav";

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
