import { describe, expect, it } from "vitest";

import { cronJobs, REMINDER_CRON, WARM_CRON } from "@/lib/cron-jobs";
import { addDays, monthBounds, startOfWeek } from "@/lib/dates";
import { progressStep, shouldTrackClick } from "@/lib/route-progress";
import { warmRanges } from "@/lib/warm-pages";

/**
 * A page switch should feel instant: the Worker and database are kept awake by a cron, the tab pages' data is
 * pre-cached with the pages' own query inputs, and a slow switch shows a progress line instead of a frozen page.
 */

const here = { origin: "https://usehourly.app", pathname: "/dashboard/today" };
const click = (
  href: string | null,
  extra: Partial<Parameters<typeof shouldTrackClick>[0]> = {},
  link: { target?: string; download?: boolean } = {},
) => {
  const a =
    href === null
      ? null
      : {
          href: new URL(href, here.origin).href,
          target: link.target ?? "",
          hasAttribute: (n: string) => n === "download" && !!link.download,
        };
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => a } as unknown as EventTarget,
    ...extra,
  };
};

describe("the warm-up cron", () => {
  it("warms on every firing and sends reminders only on the hourly one", () => {
    expect(cronJobs(WARM_CRON)).toEqual(["warm"]);
    expect(cronJobs(REMINDER_CRON)).toEqual(["warm", "reminders"]);
    expect(cronJobs(undefined)).toEqual(["warm"]);
  });
});

describe("the pre-cache asks for exactly what Week and Month ask for", () => {
  it("uses the week from Monday to Sunday and the calendar month of today", () => {
    const today = "2026-10-22"; // a Thursday
    const { week, month } = warmRanges(today);
    expect(week).toEqual({ from: startOfWeek(today), to: addDays(startOfWeek(today), 6) });
    expect(week.from <= today && today <= week.to).toBe(true);
    expect(month).toEqual(monthBounds(today));
    expect(month).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("handles a week that crosses into the next month", () => {
    const { week, month } = warmRanges("2026-09-30");
    expect(week.to > month.to).toBe(true);
    expect(month).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("the progress line", () => {
  it("moves forward, slows down and never passes 90%", () => {
    let w = 15;
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      w = progressStep(w);
      seen.push(w);
    }
    expect(seen[0]).toBeGreaterThan(15);
    expect(seen[1] - seen[0]).toBeLessThan(seen[0] - 15);
    expect(Math.max(...seen)).toBeLessThanOrEqual(90);
    expect(seen.at(-1)).toBeGreaterThan(89);
  });

  it("starts only for a plain click on a link to another page of this site", () => {
    expect(shouldTrackClick(click("/dashboard/week"), here)).toBe(true);
    expect(shouldTrackClick(click("/dashboard/today?date=2026-10-01"), here)).toBe(false); // same page
    expect(shouldTrackClick(click("/dashboard/today#x"), here)).toBe(false);
    expect(shouldTrackClick(click("https://github.com/sponsors/Zontak-LLC"), here)).toBe(false); // another site
    expect(shouldTrackClick(click("/dashboard/week", { metaKey: true }), here)).toBe(false); // new tab
    expect(shouldTrackClick(click("/dashboard/week", { ctrlKey: true }), here)).toBe(false);
    expect(shouldTrackClick(click("/dashboard/week", { shiftKey: true }), here)).toBe(false);
    expect(shouldTrackClick(click("/dashboard/week", { button: 1 }), here)).toBe(false); // middle click
    expect(shouldTrackClick(click("/dashboard/week", { defaultPrevented: true }), here)).toBe(false);
    expect(shouldTrackClick(click("/dashboard/week", {}, { target: "_blank" }), here)).toBe(false);
    expect(shouldTrackClick(click("/dashboard/week", {}, { download: true }), here)).toBe(false);
    expect(shouldTrackClick(click(null), here)).toBe(false); // not on a link
  });
});
