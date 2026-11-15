import type { Page } from "@playwright/test";

import { expect, shownMonth, signUpReady, test } from "./helpers";

// Issue 449: a tab left open overnight kept yesterday as "Today", so morning time was saved on the day before. The page
// clock is faked (page.clock) and the dates are fixed here on purpose: today() from e2e/today.ts reads Node's real clock,
// not the page's. Cookies and server time stay real; the server only checks that an entry's date is a real date.
const MONDAY_23 = new Date(2026, 2, 16, 23, 0);
const TUESDAY_09 = new Date(2026, 2, 17, 9, 0);
const AUGUST_31_23 = new Date(2026, 7, 31, 23, 0);
const PAST_MIDNIGHT = "01:01:00"; // an hour and a minute: past the app's midnight timeout (midnight + 1 s)

const days = (page: Page) => page.getByRole("navigation", { name: "Days" });
const title = (page: Page) => page.getByRole("heading", { level: 1 });

async function logOneHour(page: Page) {
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await page.getByRole("button", { name: /^Log time/ }).click();
}

test("Today moves to the new date when the tab is shown again the next morning, and time lands on it", async ({
  page,
}) => {
  await signUpReady(page);
  await page.clock.install({ time: MONDAY_23 });
  await page.goto("/dashboard/today");

  await test.step("Monday 23:00: Today is Monday 16 March, and an hour goes in", async () => {
    await expect(title(page)).toHaveText("Today");
    await expect(days(page)).toContainText("Monday, March 16");
    await logOneHour(page);
    await expect(page.getByRole("button", { name: /^Log time/ }).getByText("Logged 1:00")).toBeVisible();
    await expect(days(page)).toContainText("1:00 this day");
  });

  await test.step("Tuesday 09:00, the tab is shown again: Today is Tuesday 17 March", async () => {
    await page.clock.setSystemTime(TUESDAY_09); // the laptop slept: the clock moved on, no timer ran
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(title(page)).toHaveText("Today");
    await expect(days(page)).toContainText("Tuesday, March 17");
    await expect(days(page)).toContainText("Nothing yet");
    await logOneHour(page);
    await expect(days(page)).toContainText("1:00 this day");
  });

  await test.step("each day holds its own hour", async () => {
    await page.goto("/dashboard/today?date=2026-03-16");
    await expect(days(page)).toContainText("Monday, March 16");
    await expect(days(page)).toContainText("1:00 this day");
    await page.goto("/dashboard/today?date=2026-03-17");
    await expect(days(page)).toContainText("Tuesday, March 17");
    await expect(days(page)).toContainText("1:00 this day");
  });
});

test("a day picked in the address stays after midnight, and Back to today opens the new day", async ({ page }) => {
  await signUpReady(page);
  await page.clock.install({ time: MONDAY_23 });
  await page.goto("/dashboard/today?date=2026-03-16");
  await expect(title(page)).toHaveText("Today");
  await expect(days(page)).toContainText("Monday, March 16");

  await page.clock.runFor(PAST_MIDNIGHT); // a tab that stays open and awake: the midnight timeout fires
  await expect(days(page)).toContainText("Monday, March 16");
  await expect(days(page)).toContainText("Yesterday"); // the day picked is now yesterday
  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page).toHaveURL(/\/dashboard\/today$/);
  await expect(title(page)).toHaveText("Today");
  await expect(days(page)).toContainText("Tuesday, March 17");
});

const markedToday = (page: Page) => page.locator('[aria-current="date"]').locator("visible=true");

test("Month with no month in the address moves to September at midnight on 31 August", async ({ page }) => {
  await signUpReady(page);
  await page.clock.install({ time: AUGUST_31_23 });
  await page.goto("/dashboard/month");
  await expect(shownMonth(page)).toHaveText("August 2026");
  await expect(markedToday(page)).toHaveCount(1);
  await expect(markedToday(page)).toHaveAttribute("aria-label", /^2026-08-31:/);

  await page.clock.runFor(PAST_MIDNIGHT);
  await expect(shownMonth(page)).toHaveText("September 2026");
  await expect(markedToday(page)).toHaveCount(1);
  await expect(markedToday(page)).toHaveAttribute("aria-label", /^2026-09-01:/);
});

test("Month with a month in the address stays on it after midnight", async ({ page }) => {
  await signUpReady(page);
  await page.clock.install({ time: AUGUST_31_23 });
  await page.goto("/dashboard/month?month=2026-08");
  await expect(shownMonth(page)).toHaveText("August 2026");

  await page.clock.runFor(PAST_MIDNIGHT);
  // 1 September is in August's grid (the last week runs to Sunday 6 September): it is marked today, the month stays.
  await expect(markedToday(page)).toHaveAttribute("aria-label", /^2026-09-01:/);
  await expect(shownMonth(page)).toHaveText("August 2026");
});
