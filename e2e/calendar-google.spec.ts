import { FEATURES } from "../src/lib/features";
import { expect, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.calendar, "The calendar import is hidden in this release (src/lib/features.ts)");

/**
 * Issue #99, slice 4: "Connect Google Calendar". Google's sign-in script and its calendar answer are stand-ins here
 * (the real ones are outside the test); everything else is the real page: the button, the read in the browser, the
 * meetings, Refresh and Disconnect.
 */
declare global {
  interface Window {
    __gis?: { calls: number; revoked: string | null; fail: string | null };
  }
}

const GIS_STUB = `
window.__gis = { calls: 0, revoked: null, fail: null };
window.google = { accounts: { oauth2: {
  initTokenClient: (c) => ({ requestAccessToken: () => {
    window.__gis.calls++;
    setTimeout(() => window.__gis.fail ? c.error_callback({ type: window.__gis.fail }) : c.callback({ access_token: "fake-token", expires_in: 3600 }), 10);
  } }),
  revoke: (t, done) => { window.__gis.revoked = t; if (done) done(); },
} } };`;

test("Connect Google Calendar reads the day's meetings in the browser, refreshes, and disconnects", async ({
  page,
}) => {
  const card = page.getByRole("region", { name: "From your calendar" });
  const asked: { auth: string | undefined; url: string }[] = [];
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: GIS_STUB }),
  );
  const items = await page.evaluate(() => {
    const at = (h: number, m: number) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    const timed = (id: string, summary: string, from: string, to: string, extra = {}) => ({
      id,
      summary,
      start: { dateTime: from },
      end: { dateTime: to },
      ...extra,
    });
    return [
      timed("m1", "Offline Co planning", at(10, 0), at(10, 45)),
      timed("m2", "Dentist", at(13, 0), at(14, 0)),
      timed("m3", "Focus time", at(15, 0), at(16, 0), { transparency: "transparent" }),
      timed("m4", "Cancelled call", at(16, 0), at(17, 0), { status: "cancelled" }),
      timed("m5", "Declined sync", at(17, 0), at(18, 0), { attendees: [{ self: true, responseStatus: "declined" }] }),
      { id: "m6", summary: "Holiday", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } },
    ];
  });
  await page.route("https://www.googleapis.com/calendar/v3/calendars/primary/events*", (route) => {
    asked.push({ auth: route.request().headers().authorization, url: route.request().url() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) });
  });

  await startFreshAccount(page); // after the stand-ins are in place: the card fetches Google's script as soon as it shows
  await test.step("the card offers Google first, with the file as the second choice", async () => {
    await expect(card.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible();
    await expect(card).toContainText("UseHourly's servers never see it");
    await expect(card.getByRole("button", { name: /add a calendar file/i })).toBeVisible();
  });

  await card.getByRole("button", { name: "Connect Google Calendar" }).click();

  await test.step("only meetings you attended appear, read with a bearer token and nothing more", async () => {
    await expect(page.getByText("Connected. Read 2 meetings.")).toBeVisible();
    await expect(card.getByText("Dentist")).toBeVisible();
    for (const gone of ["Focus time", "Cancelled call", "Declined sync", "Holiday"]) {
      await expect(card.getByText(gone)).toHaveCount(0);
    }
    expect(asked[0].auth).toBe("Bearer fake-token");
    expect(asked[0].url).not.toContain("fake-token");
    await expect(card.getByText(/Google Calendar, read/)).toBeVisible();
  });

  await test.step("Refresh asks Google again", async () => {
    await card.getByRole("button", { name: "Refresh" }).click();
    await expect.poll(() => asked.length).toBe(2);
    await expect.poll(() => page.evaluate(() => window.__gis?.calls ?? 0)).toBe(2);
  });

  await test.step("it is still connected after a reload, with no popup", async () => {
    await page.reload();
    await expect(card.getByText("Offline Co planning")).toBeVisible();
    await expect(card.getByRole("button", { name: "Disconnect" })).toBeVisible();
  });

  await test.step("Disconnect forgets the meetings", async () => {
    await card.getByRole("button", { name: "Disconnect" }).click();
    await expect(card.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible();
    await expect(page.getByText("Offline Co planning")).toHaveCount(0);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hourly:calendar")));
    expect(stored).toEqual([]);
  });
});

test("a closed Google window says what happened and connects nothing", async ({ page }) => {
  const card = page.getByRole("region", { name: "From your calendar" });
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: GIS_STUB.replace("fail: null", 'fail: "popup_closed"'),
    }),
  );
  await startFreshAccount(page); // after the stand-ins are in place: the card fetches Google's script as soon as it shows
  await card.getByRole("button", { name: "Connect Google Calendar" }).click();
  await expect(page.getByText(/Google window was closed/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible();
});

test("a refusal from Google is said in plain words, never in Google's own", async ({ page }) => {
  const card = page.getByRole("region", { name: "From your calendar" });
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: GIS_STUB }),
  );
  await page.route("https://www.googleapis.com/calendar/v3/calendars/primary/events*", (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: '{"error":{"message":"internal secret"}}' }),
  );
  await startFreshAccount(page); // after the stand-ins are in place: the card fetches Google's script as soon as it shows
  await card.getByRole("button", { name: "Connect Google Calendar" }).click();
  await expect(page.getByText(/allowed reading your events/)).toBeVisible();
  await expect(page.getByText(/internal secret/)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Connect Google Calendar" })).toBeVisible();
});

test("Disconnect right after connecting tells Google to drop the token", async ({ page }) => {
  const card = page.getByRole("region", { name: "From your calendar" });
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: GIS_STUB }),
  );
  await page.route("https://www.googleapis.com/calendar/v3/calendars/primary/events*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
  await startFreshAccount(page); // after the stand-ins are in place: the card fetches Google's script as soon as it shows
  await card.getByRole("button", { name: "Connect Google Calendar" }).click();
  await expect(page.getByText(/found no meetings/)).toBeVisible();
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect.poll(() => page.evaluate(() => window.__gis?.revoked)).toBe("fake-token");
});
