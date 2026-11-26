import { describe, expect, it } from "vitest";

import { budgetStopIndex, budgetStopsFor, DOLLAR_BUDGET_STOPS, HOUR_BUDGET_STOPS } from "./budget-scale";

function gaps(stops: readonly number[], from: number, to: number) {
  return stops.slice(from + 1, to + 1).map((v, i) => v - stops[from + i]);
}

describe("budget scale", () => {
  it("dollars: 45 stops, 0 to 10000, $100 up to $3,000 then $500", () => {
    const s = DOLLAR_BUDGET_STOPS;
    expect(s).toHaveLength(45);
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBe(10000);
    expect(s.every((v) => v % 100 === 0)).toBe(true);
    expect(s[30]).toBe(3000);
    expect(gaps(s, 0, 30).every((g) => g === 100)).toBe(true);
    expect(gaps(s, 30, 44).every((g) => g === 500)).toBe(true);
    expect(31 / s.length).toBeGreaterThanOrEqual(0.6);
  });

  it("hours: 89 stops, 0 to 200, 1 h up to 60 h then 5 h", () => {
    const s = HOUR_BUDGET_STOPS;
    expect(s).toHaveLength(89);
    expect(s[0]).toBe(0);
    expect(s[s.length - 1]).toBe(200);
    expect(s.every(Number.isInteger)).toBe(true);
    expect(s[60]).toBe(60);
    expect(gaps(s, 0, 60).every((g) => g === 1)).toBe(true);
    expect(gaps(s, 60, 88).every((g) => g === 5)).toBe(true);
    expect(61 / s.length).toBeGreaterThanOrEqual(0.6);
  });

  it("picks the stops for a unit", () => {
    expect(budgetStopsFor(true)).toBe(HOUR_BUDGET_STOPS);
    expect(budgetStopsFor(false)).toBe(DOLLAR_BUDGET_STOPS);
  });

  it("finds the nearest stop index", () => {
    const s = DOLLAR_BUDGET_STOPS;
    expect(budgetStopIndex(1000, s)).toBe(10);
    expect(budgetStopIndex(3200, s)).toBe(30);
    expect(budgetStopIndex(-5, s)).toBe(0);
    expect(budgetStopIndex(25000, s)).toBe(44);
    expect(budgetStopIndex(Number.NaN, s)).toBe(0);
  });
});
