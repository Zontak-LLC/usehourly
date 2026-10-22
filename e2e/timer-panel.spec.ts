import { expect, startFreshAccount, test } from "./helpers";

test("starting the timer adds a live clock under the week panel, and Stop saves the time", async ({ page, shot }) => {
  await startFreshAccount(page, "Acme");
  await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timer running" })).toHaveCount(0);

  await shot("today-idle");
  await page.getByRole("button", { name: /Start timer/ }).click();
  const clock = page.getByRole("region", { name: "Timer running" });
  await expect(clock).toBeVisible();
  await expect(page.getByRole("region", { name: "This week" })).toBeVisible(); // the week stays, the clock sits under it
  await expect(clock.getByText("Acme", { exact: true })).toBeVisible();
  const before = await clock.getByRole("timer").innerText();
  expect(before).toMatch(/^0:\d\d$/);
  await page.waitForTimeout(2500);
  await shot("timer-running");
  await expect(page).toHaveTitle(/⏱ \d+:\d\d:\d\d · General/); // the tab shows it too

  await clock.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("region", { name: "Timer running" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's timesheet" })).toBeVisible(); // and the minute is an entry
});
