import { describe, expect, it } from "vitest";

import { defaultMonthDay, readMonthAddress } from "@/lib/month-address";

const params = (q: string) => new URLSearchParams(q);
const TODAY = "2026-10-24";

describe("the Month page's address", () => {
  it("opens this month on the Day view when the address says nothing", () => {
    expect(readMonthAddress(params(""), TODAY)).toEqual({ first: "2026-10-01", date: null, mode: "day" });
  });

  it("reads a month, a day and the Whole month view", () => {
    expect(readMonthAddress(params("month=2026-03&view=month"), TODAY)).toEqual({
      first: "2026-03-01",
      date: null,
      mode: "month",
    });
    expect(readMonthAddress(params("month=2026-03&date=2026-03-16"), TODAY)).toMatchObject({
      first: "2026-03-01",
      date: "2026-03-16",
    });
  });

  it("lets the day decide the month, so a shared day link always opens its own month", () => {
    expect(readMonthAddress(params("month=2026-03&date=2026-04-02"), TODAY)).toMatchObject({
      first: "2026-04-01",
      date: "2026-04-02",
    });
  });

  it("ignores what is not a real month, day or view", () => {
    expect(readMonthAddress(params("month=2026-13&date=2026-02-30&view=year"), TODAY)).toEqual({
      first: "2026-10-01",
      date: null,
      mode: "day",
    });
  });
});

describe("the day Month opens on", () => {
  it("is today when today is in the month", () => {
    expect(defaultMonthDay("2026-10-01", "2026-10-31", TODAY, ["2026-10-30"])).toBe(TODAY);
  });

  it("is the last day with time in another month, never a day outside it", () => {
    expect(defaultMonthDay("2026-09-01", "2026-09-30", TODAY, ["2026-09-03", "2026-09-17", "2026-10-02"])).toBe(
      "2026-09-17",
    );
  });

  it("is the 1st of an empty month", () => {
    expect(defaultMonthDay("2026-08-01", "2026-08-31", TODAY, [])).toBe("2026-08-01");
  });
});
