import { expect, startFreshAccount, test } from "./helpers";

test("the timer strip: Start runs it, Stop saves at once with Undo and Resume (#218)", async ({ page, shot }) => {
  await startFreshAccount(page, "Acme");
  const watch = page.getByRole("region", { name: "Timer" });
  await expect(watch).toBeVisible();
  await expect(watch.getByRole("button", { name: /Start\s+timer/ })).toBeVisible(); // idle: one Start button
  await shot("today-idle");

  await watch.getByRole("button", { name: /Start\s+timer/ }).click();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toHaveAttribute(
    "title",
    "Stop the timer on General",
  );
  await expect(watch.getByRole("timer")).toHaveAttribute("aria-label", /^Timer 0:0\d:\d\d$/); // the running time
  await page.waitForTimeout(2500);
  await shot("timer-running");
  await expect(page).toHaveTitle(/⏱ \d+:\d\d:\d\d · General/); // the tab shows it too
  await expect(page.getByRole("button", { name: /Start\s+timer/ })).toHaveCount(0); // one timer, no rival button

  // Stop: the time is saved at once and the strip says so, with Undo, Resume and Done. Resume carries on with the same entry.
  await page.waitForTimeout(1100); // past the press lock
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("group", { name: /Saved time/ })).toBeVisible();
  await expect(watch).toContainText(/Saved 0:01 · General/); // a stop rounds up to at least a minute
  await expect(watch.getByRole("button", { name: /Add to\s+timesheet/ })).toHaveCount(0); // nothing left to "add"
  for (const name of [/Resume\s+timer/, /^Undo$/, /^Done$/])
    await expect(watch.getByRole("button", { name })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's entries" })).toBeVisible(); // already saved as an entry
  await page.waitForTimeout(1100); // the choices are locked for a moment after they appear
  await watch.getByRole("button", { name: /Resume\s+timer/ }).click();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  const sheet = page.getByRole("region", { name: "Today's entries" });
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)"); // the same entry, not a second one

  // Stop again and Undo: nothing is kept.
  await page.waitForTimeout(1100);
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("group", { name: /Saved time/ })).toBeVisible();
  await page.waitForTimeout(1100); // the choices are locked for a moment after they appear
  await watch.getByRole("button", { name: /^Undo$/ }).click();
  await expect(page.getByText("Undone. Nothing was saved.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's entries" })).toHaveCount(0);
  await expect(watch.getByRole("button", { name: /Start\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("button", { name: /Start\s+timer/ })).toBeVisible(); // idle: one Start button
});

test("Stop keeps the time as an entry; Done gets the timer ready again", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  const watch = page.getByRole("region", { name: "Timer" });
  await watch.getByRole("button", { name: /Start\s+timer/ }).click();
  await page.waitForTimeout(1500);
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("group", { name: /Saved time/ })).toBeVisible();
  // Already in the entries before anything else is pressed: Stop saves it.
  const sheet = page.getByRole("region", { name: "Today's entries" });
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)");
  await expect(sheet).toContainText("Total 0:01"); // a stop rounds up to at least a minute
  await page.waitForTimeout(1100); // the choices are locked for a moment after they appear
  await watch.getByRole("button", { name: /^Done$/ }).click();
  await expect(watch.getByRole("button", { name: /Start\s+timer/ })).toBeVisible();
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)"); // Done keeps it
});

test("a double click on Start starts the timer and does not stop it again (found 2026-10-23)", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  const watch = page.getByRole("region", { name: "Timer" });
  await watch.getByRole("button", { name: /Start\s+timer/ }).dblclick();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  await page.waitForTimeout(1500);
  // still running, and nothing was stopped by the second click
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("group", { name: /Saved time/ })).toHaveCount(0);
  // the only entry is the running timer itself: the second click did not stop it and save a short one
  const sheet = page.getByRole("region", { name: "Today's entries" });
  await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(1 entry)");
  // and a double click on Stop stops once and offers the choices, without starting a new timer
  await watch.getByRole("button", { name: /Stop\s+timer/ }).dblclick();
  await expect(watch.getByRole("button", { name: /Resume\s+timer/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(watch.getByRole("button", { name: /Resume\s+timer/ })).toBeVisible();
  await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toHaveCount(0);
});
