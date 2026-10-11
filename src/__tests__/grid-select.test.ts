import { describe, expect, it } from "vitest";

import { rectDays } from "@/lib/grid-select";

// October 2026 as the calendar draws it (Mon-first): Sep 28–30 are grey padding days.
const weeks = [
  ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
  ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"],
  ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
  ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
];
const inOctober = (d: string) => d.startsWith("2026-10");

describe("month calendar drag-select", () => {
  it("selects a spreadsheet-style block: Mon–Fri over two weeks = all ten weekdays", () => {
    const got = rectDays(weeks, { r0: 1, c0: 0, r1: 2, c1: 4 }, inOctober);
    expect([...got].sort()).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
  });

  it("works in any drag direction", () => {
    const forward = rectDays(weeks, { r0: 1, c0: 1, r1: 2, c1: 3 }, inOctober);
    const backward = rectDays(weeks, { r0: 2, c0: 3, r1: 1, c1: 1 }, inOctober);
    expect([...backward].sort()).toEqual([...forward].sort());
    expect(forward.size).toBe(6);
  });

  it("leaves out the grey days of neighbouring months", () => {
    const got = rectDays(weeks, { r0: 0, c0: 0, r1: 0, c1: 4 }, inOctober);
    expect([...got].sort()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("a single cell selects just that day, and out-of-grid coordinates are ignored", () => {
    expect([...rectDays(weeks, { r0: 3, c0: 2, r1: 3, c1: 2 }, inOctober)]).toEqual(["2026-10-21"]);
    expect(rectDays(weeks, { r0: 9, c0: 9, r1: 9, c1: 9 }, inOctober).size).toBe(0);
  });
});
