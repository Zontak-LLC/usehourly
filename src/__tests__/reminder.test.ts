import { describe, expect, it } from "vitest";

import {
  buildWeeklyReminder,
  isDue,
  isValidTimeZone,
  localParts,
  mondayOf,
  reminderTimePassed,
  weekKey,
  workDays,
} from "@/lib/reminder";
import { cronToken, unsubscribeToken, verifyCronToken, verifyUnsubscribeToken } from "@/lib/reminder-token";

describe("what time is it for each person", () => {
  // Saturday 2026-10-17 01:30 UTC
  const now = new Date("2026-10-17T01:30:00Z");

  it("reads the date, weekday and hour in their own time zone", () => {
    expect(localParts(now, "America/Los_Angeles")).toEqual({ date: "2026-10-16", weekday: 5, hour: 18 });
    expect(localParts(now, "America/New_York")).toEqual({ date: "2026-10-16", weekday: 5, hour: 21 });
    expect(localParts(now, "Asia/Tokyo")).toEqual({ date: "2026-10-17", weekday: 6, hour: 10 });
    expect(localParts(new Date("2026-10-17T00:30:00Z"), "UTC")).toEqual({ date: "2026-10-17", weekday: 6, hour: 0 });
  });

  it("knows which time zones are real", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Nope/Nowhere")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(() => localParts(now, "Nope/Nowhere")).toThrow();
  });

  it("is due on Friday from 4 pm local, not before, not on other days", () => {
    expect(isDue(new Date("2026-10-16T22:59:00Z"), "America/Los_Angeles", null).due).toBe(false); // 3:59 pm
    expect(isDue(new Date("2026-10-16T23:00:00Z"), "America/Los_Angeles", null).due).toBe(true); // 4:00 pm
    expect(isDue(new Date("2026-10-16T14:00:00Z"), "UTC", null).due).toBe(false); // Friday morning
    expect(isDue(new Date("2026-10-15T20:00:00Z"), "UTC", null).due).toBe(false); // Thursday
    expect(isDue(new Date("2026-10-17T20:00:00Z"), "UTC", null).due).toBe(false); // Saturday
  });

  it("is due once a week: not again after sending, and again the next Friday", () => {
    const friday = new Date("2026-10-16T21:00:00Z");
    const first = isDue(friday, "UTC", null);
    expect(first).toMatchObject({ due: true, week: "2026-W42", today: "2026-10-16" });
    expect(isDue(friday, "UTC", "2026-W42").due).toBe(false);
    expect(isDue(new Date("2026-10-23T21:00:00Z"), "UTC", "2026-W42")).toMatchObject({ due: true, week: "2026-W43" });
  });

  it("follows daylight saving time instead of a fixed offset", () => {
    // New York: EDT until 1 Nov 2026, EST after. 4:30 pm local on both Fridays.
    expect(isDue(new Date("2026-10-30T20:30:00Z"), "America/New_York", null).due).toBe(true);
    expect(isDue(new Date("2026-11-06T21:30:00Z"), "America/New_York", null).due).toBe(true);
    expect(isDue(new Date("2026-11-06T20:30:00Z"), "America/New_York", null).due).toBe(false); // only 3:30 pm EST
  });

  it("treats the weekend as 'this week's time has passed'", () => {
    expect(reminderTimePassed(new Date("2026-10-16T10:00:00Z"), "UTC")).toBe(false);
    expect(reminderTimePassed(new Date("2026-10-16T16:00:00Z"), "UTC")).toBe(true);
    expect(reminderTimePassed(new Date("2026-10-18T09:00:00Z"), "UTC")).toBe(true);
    expect(reminderTimePassed(new Date("2026-10-19T09:00:00Z"), "UTC")).toBe(false); // Monday
  });
});

describe("weeks", () => {
  it("labels ISO weeks, including the awkward ones around New Year", () => {
    expect(weekKey("2026-10-16")).toBe("2026-W42");
    expect(weekKey("2026-12-31")).toBe("2026-W53");
    expect(weekKey("2027-01-01")).toBe("2026-W53");
    expect(weekKey("2027-01-04")).toBe("2027-W01");
    expect(weekKey("2024-12-30")).toBe("2025-W01");
    expect(weekKey("2026-10-18")).toBe("2026-W42"); // Sunday belongs to the week that began on Monday
  });

  it("finds Monday and the five working days", () => {
    expect(mondayOf("2026-10-16")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(workDays("2026-10-16")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  });
});

describe("the email", () => {
  const base = {
    email: "jo@example.com",
    today: "2026-10-16",
    appUrl: "https://usehourly.app",
    unsubscribeUrl: "https://usehourly.app/reminders/off?u=1&t=x",
    oneClickUrl: "https://usehourly.app/api/reminders/off?u=1&t=x",
  };
  const entry = (date: string, minutes: number, project = "Website", client = "Acme") => ({
    date,
    minutes,
    project: { name: project, client: { name: client } },
  });

  it("shows the week so far, flags empty weekdays and links to the week page and the one-click off switch", () => {
    const m = buildWeeklyReminder({
      ...base,
      name: "Jo Freelance",
      entries: [
        entry("2026-10-12", 210),
        entry("2026-10-13", 465),
        entry("2026-10-13", 60, "Support", "Globex"),
        entry("2026-10-15", 30),
      ],
    });
    expect(m.to).toBe("jo@example.com");
    expect(m.subject).toBe("Your week so far: 12.75 h logged");
    expect(m.text).toContain("Hi Jo,");
    expect(m.text).toMatch(/Mon, Oct 12\s+3\.5 h/);
    expect(m.text).toMatch(/Tue, Oct 13\s+8\.75 h/);
    expect(m.text).toMatch(/Wed, Oct 14\s+nothing logged/);
    expect(m.text).toMatch(/Fri, Oct 16\s+nothing logged/);
    expect(m.text).toContain("Total: 12.75 h across 2 projects.");
    expect(m.text).toContain("2 weekdays have nothing logged");
    expect(m.text).toContain("https://usehourly.app/dashboard/week");
    expect(m.text).toContain(base.unsubscribeUrl);
    expect(m.headers).toEqual({
      "List-Unsubscribe": `<${base.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("is kind about an empty week and copes with a missing name", () => {
    const m = buildWeeklyReminder({ ...base, name: null, entries: [] });
    expect(m.subject).toBe("Friday check-in: time to log your hours?");
    expect(m.text).toContain("Hi,");
    expect(m.text).toContain("You haven't logged any time this week yet");
    expect(m.text).not.toContain("weekdays have nothing logged");
  });
});

describe("signed links", () => {
  it("accepts only the right token for the right person", async () => {
    const t = await unsubscribeToken("s3cret", "user-1");
    expect(await verifyUnsubscribeToken("s3cret", "user-1", t)).toBe(true);
    expect(await verifyUnsubscribeToken("s3cret", "user-2", t)).toBe(false);
    expect(await verifyUnsubscribeToken("other-secret", "user-1", t)).toBe(false);
    expect(await verifyUnsubscribeToken("s3cret", "user-1", `${t}x`)).toBe(false);
    expect(await verifyUnsubscribeToken("s3cret", "user-1", "")).toBe(false);
    expect(await verifyUnsubscribeToken("", "user-1", t)).toBe(false);
  });

  it("keeps the cron key separate from unsubscribe links", async () => {
    const k = await cronToken("s3cret");
    expect(await verifyCronToken("s3cret", `Bearer ${k}`)).toBe(true);
    expect(await verifyCronToken("s3cret", `Bearer ${await unsubscribeToken("s3cret", "x")}`)).toBe(false);
    expect(await verifyCronToken("s3cret", null)).toBe(false);
    expect(await verifyCronToken("s3cret", k)).toBe(false); // needs the Bearer word
    expect(await verifyCronToken("", `Bearer ${k}`)).toBe(false);
  });
});
