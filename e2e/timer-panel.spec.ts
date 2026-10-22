import { expect, startFreshAccount, test } from "./helpers";

test("starting the timer shows a slim bar and the day dial counts it; Stop saves the time", async ({ page, shot }) => {
  await startFreshAccount(page, "Acme");
  await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timer running" })).toHaveCount(0);

  await shot("today-idle");
  await page.getByRole("button", { name: /Start timer/ }).click();
  const clock = page.getByRole("region", { name: "Timer running" });
  await expect(clock).toBeVisible();
  await expect(page.getByRole("region", { name: "This week" })).toBeVisible(); // the week stays
  // One clock for the day: the dial says it counts the timer, and there is no second dial.
  await expect(page.getByRole("region", { name: "Today's hours" })).toContainText("Logged + timer");
  await expect(clock.locator("circle")).toHaveCount(0); // only the Stop icon is a drawing
  await expect(clock).toContainText("Acme");
  const before = await clock.getByRole("timer").innerText();
  expect(before).toMatch(/^0:\d\d:\d\d$/);
  await page.waitForTimeout(2500);
  await shot("timer-running");
  await expect(page).toHaveTitle(/⏱ \d+:\d\d:\d\d · General/); // the tab shows it too

  await clock.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("region", { name: "Timer running" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Today's hours" })).not.toContainText("Logged + timer");
  await expect(page.getByRole("region", { name: "Today's timesheet" })).toBeVisible(); // and the minute is an entry
});
