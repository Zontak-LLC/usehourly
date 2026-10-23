import { expect, startFreshAccount, test } from "./helpers";

test("the timer lives under the watch: Start runs it, Stop asks resume, add or discard", async ({ page, shot }) => {
  await startFreshAccount(page, "Acme");
  const watch = page.getByRole("region", { name: "Today's hours" });
  await expect(watch).toBeVisible();
  await expect(watch.getByRole("timer")).toHaveText("0:00:00");
  await shot("today-idle");

  // One timer, in the steel tray under the watch.
  await watch.getByRole("button", { name: /Start\s+timer/ }).click();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toHaveAttribute(
    "title",
    "Stop the timer on General",
  );
  await expect(watch.getByRole("timer")).toHaveText(/^0:0\d:\d\d$/); // the running time in the watch's window
  await page.waitForTimeout(2500);
  await shot("timer-running");
  await expect(page).toHaveTitle(/⏱ \d+:\d\d:\d\d · General/); // the tab shows it too
  await expect(page.getByRole("button", { name: /Start\s+timer/ })).toHaveCount(0); // one timer, no rival button

  // Stop: the window says what was stopped and three choices show. Resume carries on with the same entry.
  await page.waitForTimeout(1100); // past the press lock
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("timer")).toHaveText(/^Stopped \d+:\d\d$/);
  for (const name of [/Resume\s+timer/, /Add to\s+timesheet/, /Discard\s+time/])
    await expect(watch.getByRole("button", { name })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's timesheet" })).toBeVisible(); // already saved as an entry
  await page.waitForTimeout(1100); // the choices are locked for a moment after they appear
  await watch.getByRole("button", { name: /Resume\s+timer/ }).click();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  const sheet = page.getByRole("region", { name: "Today's timesheet" });
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)"); // the same entry, not a second one

  // Stop again and discard: nothing is kept.
  await page.waitForTimeout(1100);
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("timer")).toHaveText(/^Stopped/);
  await page.waitForTimeout(1100); // the choices are locked for a moment after they appear
  await watch.getByRole("button", { name: /Discard\s+time/ }).click();
  await expect(page.getByText("Timer discarded")).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's timesheet" })).toHaveCount(0);
  await expect(watch.getByRole("button", { name: /Start\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("timer")).toHaveText("0:00:00");
});

test("Add to timesheet keeps the stopped time as an entry and the timer is ready again", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  const watch = page.getByRole("region", { name: "Today's hours" });
  await watch.getByRole("button", { name: /Start\s+timer/ }).click();
  await page.waitForTimeout(1500);
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("timer")).toHaveText(/^Stopped/);
  await page.waitForTimeout(1100); // the choices are locked for a moment after they appear
  await watch.getByRole("button", { name: /Add to\s+timesheet/ }).click();
  await expect(watch.getByRole("button", { name: /Start\s+timer/ })).toBeVisible();
  const sheet = page.getByRole("region", { name: "Today's timesheet" });
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)");
  await expect(sheet).toContainText("Total 0:01"); // a stop rounds up to at least a minute
});

test("a double click on Start starts the timer and does not stop it again (found 2026-10-23)", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  const watch = page.getByRole("region", { name: "Today's hours" });
  await watch.getByRole("button", { name: /Start\s+timer/ }).dblclick();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  await page.waitForTimeout(1500);
  // still running, and nothing was stopped by the second click
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("timer")).not.toContainText("Stopped");
  // the only entry is the running timer itself: the second click did not stop it and save a short one
  const sheet = page.getByRole("region", { name: "Today's timesheet" });
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)");
  // and a double click on Stop stops once and offers the choices, without starting a new timer
  await watch.getByRole("button", { name: /Stop\s+timer/ }).dblclick();
  await expect(watch.getByRole("button", { name: /Resume\s+timer/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(watch.getByRole("button", { name: /Resume\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toHaveCount(0);
});
