import { afterEach, describe, expect, it } from "vitest";

import { DATE_LOCALE, formatDate, formatInstant } from "@/lib/dates";

const TZ = process.env.TZ;
afterEach(() => {
  if (TZ === undefined) delete process.env.TZ;
  else process.env.TZ = TZ;
});

describe("one helper writes every invoice and timesheet date", () => {
  it("gives each style its exact text", () => {
    expect(DATE_LOCALE).toBe("en-US");
    expect(formatDate("2026-10-25", "day")).toBe("Oct 25, 2026");
    expect(formatDate("2026-10-25", "dayWithWeekday")).toBe("Sun, Oct 25");
    expect(formatDate("2026-10-25", "full")).toBe("October 25, 2026");
  });

  it("never moves a YYYY-MM-DD date a day, far behind or far ahead of UTC", () => {
    for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      expect(formatDate("2026-01-01", "day"), zone).toBe("Jan 1, 2026");
      expect(formatDate("2026-12-31", "day"), zone).toBe("Dec 31, 2026");
      expect(formatDate("2026-10-25", "dayWithWeekday"), zone).toBe("Sun, Oct 25");
      expect(formatDate("2026-10-25", "full"), zone).toBe("October 25, 2026");
    }
  });

  it("writes a moment in the time zone it is given, late in the UTC day too", () => {
    process.env.TZ = "Pacific/Kiritimati";
    const late = Date.UTC(2026, 9, 25, 23, 30);
    expect(formatInstant(late, "full", "UTC")).toBe("October 25, 2026");
    expect(formatInstant(new Date(late), "day", "UTC")).toBe("Oct 25, 2026");
    expect(formatInstant(new Date(late).toISOString(), "full", "UTC")).toBe("October 25, 2026");
    // no zone = the runtime's own, as the send-invoice panel does in the browser
    expect(formatInstant(late, "day")).toBe("Oct 26, 2026");
  });
});
