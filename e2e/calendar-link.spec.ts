import { icsFor } from "./calendar-fixture";
import { expect, startFreshAccount, test } from "./helpers";

/**
 * Issue #99, slice 2: a private calendar address (Google's "secret address in iCal format") read through the server,
 * which only passes the text along. The server's reply is a stand-in here (the real hosts are outside the test).
 */
const GOOGLE = "https://calendar.google.com/calendar/ical/me%40example.com/private-abc123/basic.ics";

test("a private calendar address shows the day's meetings, refreshes, and is forgotten on removal", async ({
  page,
}) => {
  await startFreshAccount(page);
  const card = page.getByRole("region", { name: "From your calendar" });
  const requests: string[] = [];
  const ics = await icsFor(page);
  await page.route("**/api/calendar-feed", async (route) => {
    requests.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "text/calendar", body: ics });
  });

  await test.step("an address from another kind of site is refused before anything is sent", async () => {
    await card.getByRole("button", { name: "Or connect with a private calendar address" }).click();
    await card.getByLabel("Private calendar address").fill("https://evil.example.com/x.ics");
    await card.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText(/Only Google, Outlook and iCloud/)).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  await test.step("a Google address is read and the meetings appear", async () => {
    await card.getByLabel("Private calendar address").fill(GOOGLE);
    await card.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Connected. Read 2 meetings.")).toBeVisible();
    await expect(card.getByText("Offline Co planning")).toBeVisible();
    await expect(card.getByText(/Google Calendar, read/)).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0])).toEqual({ url: GOOGLE });
  });

  await test.step("the address is not shown on the page, and Refresh reads it again", async () => {
    await expect(card).not.toContainText("private-abc123");
    await card.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("Calendar updated.")).toBeVisible();
    expect(requests).toHaveLength(2);
  });

  await test.step("a refusal from the server is shown in its own words", async () => {
    await page.unroute("**/api/calendar-feed");
    await page.route("**/api/calendar-feed", (route) =>
      route.fulfill({
        status: 403,
        json: { error: "The calendar service said no. The private address may have been reset." },
      }),
    );
    await card.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(/may have been reset/)).toBeVisible();
    await expect(card.getByText("Offline Co planning")).toBeVisible(); // the last good copy stays
  });

  await test.step("a read still in flight when the calendar is removed does not bring the address back", async () => {
    await page.unroute("**/api/calendar-feed");
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    let asked = false;
    await page.route("**/api/calendar-feed", async (route) => {
      asked = true;
      await gate;
      await route.fulfill({ status: 200, contentType: "text/calendar", body: ics });
    });
    await card.getByRole("button", { name: "Refresh" }).click();
    await expect.poll(() => asked).toBe(true);
    await card.getByRole("button", { name: "Remove calendar" }).click();
    await expect(card).toContainText("Turn meetings into time entries");
    release();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => localStorage.getItem("hourly:calendarLink"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("hourly:calendar"))).toBeNull();
    await expect(card).toContainText("Turn meetings into time entries");
  });
});
