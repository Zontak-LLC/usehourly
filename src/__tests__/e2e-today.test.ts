import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { today } from "../../e2e/today";

/**
 * The browser tests' "today" (issue 310): the app shows the browser's LOCAL date, so the tests must expect that one too.
 * At 20:48 in New York it is already tomorrow in UTC; a UTC "today" made the Today tests fail every US evening.
 */
describe("browser tests: today is the local date", () => {
  const zone = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/New_York";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it("is still the 24th at 20:48 in New York, when UTC is already on the 25th", () => {
    vi.setSystemTime(new Date("2026-10-25T00:48:00Z"));
    expect(today()).toBe("2026-10-24");
  });

  it("is the 25th once New York reaches midnight", () => {
    vi.setSystemTime(new Date("2026-10-25T04:00:00Z"));
    expect(today()).toBe("2026-10-25");
  });
});
