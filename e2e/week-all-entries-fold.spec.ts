import type { Page } from "@playwright/test";

import { expect, signUpByApi, test, trpc } from "./helpers";

/**
 * Week's "All entries this week" list: hidden while all the week's time is on one day (the day panel already shows it),
 * otherwise folded behind one row "All N entries this week" that opens by tap or keyboard, and stays as left on this
 * device. The week of Monday, September 7, 2026 is used, so the dates never depend on today.
 */
const WEEK = "/dashboard/week?date=2026-09-08";

const fold = (page: Page) => page.getByRole("button", { name: /^All \d+ entries this week$/ });
const list = (page: Page) => page.getByRole("region", { name: "All entries this week" });

/** A new account with one project, and an entry per item of `days` (its date, in the week above). */
async function seed(page: Page, days: string[]) {
  await signUpByApi(page);
  const client = await trpc<{ id: string }>(page, "clients.create", { name: "Acme" });
  const project = await trpc<{ id: string }>(page, "project.create", {
    clientId: client.id,
    name: "General",
    hourlyRate: 0,
  });
  for (const [i, date] of days.entries()) {
    await trpc(page, "entry.create", { projectId: project.id, date, minutes: 30, note: `Note ${i + 1}` });
  }
}

test("a week with all its time on one day shows no second list", async ({ page }) => {
  await seed(page, ["2026-09-08", "2026-09-08"]);
  await page.goto(WEEK);
  await expect(page.getByText("Note 1")).toBeVisible();
  await expect(page.getByText("Note 2")).toBeVisible();
  await expect(fold(page)).toHaveCount(0);
  await expect(list(page)).toHaveCount(0);
});

test("a week with time on two days shows the folded row, which opens and folds by click", async ({ page }) => {
  await seed(page, ["2026-09-08", "2026-09-08", "2026-09-10"]);
  await page.goto(WEEK);
  const row = page.getByRole("button", { name: "All 3 entries this week" });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(list(page)).toHaveCount(0);

  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(list(page)).toBeVisible();
  await expect(list(page).getByRole("heading", { name: "All entries this week (3)" })).toBeVisible();
  await expect(list(page).getByRole("searchbox", { name: "Search entries" })).toBeVisible();
  for (const note of ["Note 1", "Note 2", "Note 3"]) await expect(list(page)).toContainText(note);

  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(list(page)).toHaveCount(0);
});

test("Enter opens the row and Space folds it", async ({ page }) => {
  await seed(page, ["2026-09-08", "2026-09-08", "2026-09-10"]);
  await page.goto(WEEK);
  const row = fold(page);
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(list(page)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(list(page)).toHaveCount(0);
});

test("the choice is kept after a reload on this device", async ({ page }) => {
  await seed(page, ["2026-09-08", "2026-09-10"]);
  await page.goto(WEEK);
  await fold(page).click();
  await expect(list(page)).toBeVisible();
  await page.reload();
  await expect(fold(page)).toHaveAttribute("aria-expanded", "true");
  await expect(list(page)).toBeVisible();

  await fold(page).click();
  await expect(list(page)).toHaveCount(0);
  await page.reload();
  await expect(fold(page)).toHaveAttribute("aria-expanded", "false");
  await expect(list(page)).toHaveCount(0);
});

test("logging time on a second day brings the folded row, with no reload", async ({ page }) => {
  await seed(page, ["2026-09-08", "2026-09-08"]);
  await page.goto(WEEK);
  await expect(page.getByText("Note 1")).toBeVisible();
  await expect(fold(page)).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "This week" })
    .getByRole("button", { name: /Thursday, September 10/ })
    .click();
  await page.getByLabel("Time to add").fill("1");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(page.getByRole("button", { name: "All 3 entries this week" })).toBeVisible();
});
