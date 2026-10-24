import { describe, expect, it } from "vitest";

import {
  lastWorkday,
  loadNotNow,
  minutesByDate,
  missedDays,
  monthWeeks,
  NOT_NOW_KEY,
  nudgeDay,
  saveNotNow,
} from "@/lib/day-nav";

// 2026-10-23 is a Friday; the week before runs Fri Oct 16 to Thu Oct 22 (Oct 17-18 are the weekend).
const TODAY = "2026-10-23";
const e = (date: string, minutes = 60) => ({ date, minutes });

describe("Today's missed days: recent weekdays with no time", () => {
  it("a freelancer who logged Friday and Monday, then forgot Tuesday to Thursday, is shown those three days", () => {
    expect(missedDays([e("2026-10-16"), e("2026-10-19")], TODAY)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("weekends, today itself and days marked non-billable are never missed", () => {
    const days = missedDays([e("2026-10-16")], TODAY, new Set(["2026-10-21"]));
    expect(days).toEqual(["2026-10-19", "2026-10-20", "2026-10-22"]);
    expect(days).not.toContain("2026-10-17");
    expect(days).not.toContain(TODAY);
  });

  it("a new account, or someone with no time all week, is not told off: only days after the first logged day count", () => {
    expect(missedDays([], TODAY)).toEqual([]);
    expect(missedDays([e("2026-10-21")], TODAY)).toEqual(["2026-10-22"]);
    expect(missedDays([e("2026-10-22")], TODAY)).toEqual([]);
  });

  it("time outside the last week, zero-minute rows (a timer just started) and time today do not count as logged", () => {
    expect(missedDays([e("2026-10-10"), e("2026-10-19", 0), e(TODAY)], TODAY)).toEqual([]);
    expect(missedDays([e("2026-10-16"), e("2026-10-19", 0)], TODAY)).toContain("2026-10-19");
  });
});

describe("the day calendar's month grid", () => {
  it("October 2026 starts on a Thursday: five Monday-first weeks, from Sep 28 to Nov 1", () => {
    const weeks = monthWeeks("2026-10-23");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks[0][3]).toBe("2026-10-01");
    expect(weeks.at(-1)?.[6]).toBe("2026-11-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("a month that starts on a Monday begins on its first; a long one runs to six weeks", () => {
    expect(monthWeeks("2026-06-15")[0][0]).toBe("2026-06-01");
    expect(monthWeeks("2026-08-01")).toHaveLength(6); // Aug 1, 2026 is a Saturday, Aug 31 a Monday
  });

  it("adds up a day's minutes across entries", () => {
    const m = minutesByDate([e("2026-10-20", 30), e("2026-10-20", 45), e("2026-10-21", 10)]);
    expect(m.get("2026-10-20")).toBe(75);
    expect(m.get("2026-10-21")).toBe(10);
    expect(m.get("2026-10-22")).toBeUndefined();
  });
});

describe("the missed-day line on Today (issue 99): one calm nudge for the last working day, in the app only", () => {
  const storage = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("Friday morning, nothing on Thursday: the line points at Thursday; older gaps stay as the quiet buttons", () => {
    const missed = missedDays([e("2026-10-16"), e("2026-10-19")], TODAY); // Tue, Wed, Thu
    expect(nudgeDay(missed, TODAY, new Set())).toBe("2026-10-22");
  });

  it("on a Monday (or the weekend) the last working day is Friday", () => {
    expect(lastWorkday("2026-10-26")).toBe("2026-10-23"); // Monday
    expect(lastWorkday("2026-10-25")).toBe("2026-10-23"); // Sunday
    expect(lastWorkday("2026-10-24")).toBe("2026-10-23"); // Saturday
    expect(lastWorkday("2026-10-23")).toBe("2026-10-22"); // Friday
    const missed = missedDays([e("2026-10-22")], "2026-10-26");
    expect(nudgeDay(missed, "2026-10-26", new Set())).toBe("2026-10-23");
  });

  it("says nothing when the last working day has time, was marked non-billable, or came before the person started", () => {
    expect(nudgeDay(missedDays([e("2026-10-20"), e("2026-10-22")], TODAY), TODAY, new Set())).toBeNull();
    expect(nudgeDay(missedDays([e("2026-10-20")], TODAY, new Set(["2026-10-22"])), TODAY, new Set())).toBeNull();
    expect(nudgeDay(missedDays([], TODAY), TODAY, new Set())).toBeNull();
  });

  it("Not now hides it for that date only, survives a reload, and a damaged value is ignored", () => {
    const s = storage();
    const missed = missedDays([e("2026-10-16")], TODAY);
    expect(saveNotNow(s, "2026-10-22").has("2026-10-22")).toBe(true);
    expect(nudgeDay(missed, TODAY, loadNotNow(s))).toBeNull();
    // the next Monday's Friday gap is a new date: the line comes back for it
    expect(nudgeDay(missedDays([e("2026-10-22")], "2026-10-26"), "2026-10-26", loadNotNow(s))).toBe("2026-10-23");
    s.setItem(NOT_NOW_KEY, JSON.stringify(["2026-10-22", 5, "nope"]));
    expect([...loadNotNow(s)]).toEqual(["2026-10-22"]);
    s.setItem(NOT_NOW_KEY, "{broken");
    expect(loadNotNow(s).size).toBe(0);
    expect(loadNotNow(null).size).toBe(0);
  });
});
