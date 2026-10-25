import { describe, expect, it } from "vitest";

import { reportYear, yearRange } from "@/lib/report-year";

/** The page wrapper and the view both pick the year with this, so their queries are the same one in the cache. */
describe("the year the Year summary opens on", () => {
  it("opens ?year= when it is a real past year or this year", () => {
    expect(reportYear("?year=2025", 2026)).toBe(2025);
    expect(reportYear("?year=2026", 2026)).toBe(2026);
  });

  it("opens this year for no year, a future year, a year before 2000 or something that is not a year", () => {
    expect(reportYear("", 2026)).toBe(2026);
    expect(reportYear("?year=2031", 2026)).toBe(2026);
    expect(reportYear("?year=1999", 2026)).toBe(2026);
    expect(reportYear("?year=20x5", 2026)).toBe(2026);
    expect(reportYear("?year=2025.5", 2026)).toBe(2026);
  });
});

/** The wrapper prefetches the expense list with this range and the view reads it, so it must cover the whole year. */
describe("the expense range of a Year summary year", () => {
  it("runs from January 1 to December 31 of that year", () => {
    expect(yearRange(2025)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
});
