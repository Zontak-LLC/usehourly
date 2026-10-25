import type { Locator, Page } from "@playwright/test";

import { expect, signUpByApi, test } from "./helpers";
import { join } from "node:path";

const HARVEST = join(__dirname, "../src/__tests__/fixtures/harvest-time-report.csv");
const TOGGL = join(__dirname, "../src/__tests__/fixtures/toggl-detailed.csv");

/** Account → Your data → Import history, with `source` picked and the steps to export its file shown. */
async function pickSource(page: Page, source: string, step: string) {
  await page.goto("/dashboard/account#data");
  const panel = page.getByRole("region", { name: "Import history" });
  await expect(panel).toBeVisible();
  await panel.getByText(source, { exact: true }).click();
  await expect(panel.getByRole("radio", { name: source })).toBeChecked();
  await expect(panel.getByRole("list", { name: "How to export the file" })).toContainText(step);
  return panel;
}

/** Chooses the file and returns the preview of what it holds. */
async function chooseFile(panel: Locator, file: string) {
  await panel.locator('input[type="file"]').setInputFiles(file);
  return panel.getByTestId("import-preview");
}

/**
 * "Move here in two minutes": someone coming from Harvest picks where their time is, follows the export steps, sees a
 * preview of what is new, imports, and finds the time on Week. The same file a second time adds nothing.
 */
test("a freelancer moves their Harvest history over and finds it on Week", async ({ page, audit, shot }) => {
  await signUpByApi(page);
  const panel = await test.step("pick Harvest: the steps to export the file show", () =>
    pickSource(page, "Harvest", "Detailed report"));

  await test.step("the preview says what the file holds and what is new", async () => {
    const preview = await chooseFile(panel, HARVEST);
    await expect(preview).toContainText("6 entries");
    await expect(preview).toContainText("Sep 14, 2026 to Sep 18, 2026");
    await expect(preview).toContainText("8:47 h");
    await expect(preview).toContainText("2 new clients · 3 new projects");
    await audit("import preview");
    await panel.scrollIntoViewIfNeeded();
    await shot("import-preview");
  });

  await test.step("import, then open the week of the newest day", async () => {
    await panel.getByRole("button", { name: "Import 6 entries" }).click();
    const done = panel.getByRole("status").filter({ hasText: "Imported 6 entries." });
    await expect(done).toContainText("Added 2 clients and 3 projects.");
    await done.getByRole("link", { name: "See the week of Sep 18, 2026" }).click();
    await expect(page).toHaveURL(/dashboard\/week\?date=2026-09-18/);
    await expect(page.getByRole("region", { name: "This week", exact: true })).toContainText("8:47");
    await expect(page.getByText("Accessibility audit, part 1").first()).toBeVisible(); // in the day and in the open week list
    await expect(page.getByText("Quick call").first()).toBeVisible();
  });

  await test.step("the same file again: everything is already here, nothing to import", async () => {
    await pickSource(page, "Harvest", "Detailed report");
    const preview = await chooseFile(panel, HARVEST);
    await expect(preview).toContainText("6 already here");
    await expect(preview).toContainText("No new clients or projects");
    await expect(panel.getByRole("button", { name: "Nothing new to import" })).toBeDisabled();
  });
});

/**
 * The same move from Toggl Track, with its real Detailed export: a byte-order mark, Windows line ends, a description
 * over two lines, a row with no client or project, and a timer that was still running (that row can't be used).
 */
test("a freelancer moves their Toggl Track history over and finds it on Week", async ({ page, audit, shot }) => {
  await signUpByApi(page);
  const panel = await test.step("pick Toggl Track: the steps to export the file show", () =>
    pickSource(page, "Toggl Track", "Download CSV"));

  await test.step("the preview says what the file holds, what is new and what can't be used", async () => {
    const preview = await chooseFile(panel, TOGGL);
    await expect(panel).toContainText("looks like a Toggl Track export");
    await expect(preview).toContainText("4 entries");
    await expect(preview).toContainText("Sep 14, 2026 to Sep 16, 2026");
    await expect(preview).toContainText("4:21 h");
    await expect(preview).toContainText("2 new clients · 3 new projects");
    await panel.getByText("1 row in the file can't be used").click();
    await expect(panel.getByText("Line 6: No duration (a timer that was still running?)")).toBeVisible();
    await audit("toggl import preview");
    await panel.scrollIntoViewIfNeeded();
    await shot("toggl-import-preview");
  });

  await test.step("import, then find the time on Week under the right client and project", async () => {
    await panel.getByRole("button", { name: "Import 4 entries" }).click();
    const done = panel.getByRole("status").filter({ hasText: "Imported 4 entries." });
    await expect(done).toContainText("Added 2 clients and 3 projects.");
    await done.getByRole("link", { name: "See the week of Sep 16, 2026" }).click();
    await expect(page).toHaveURL(/dashboard\/week\?date=2026-09-16/);
    const week = page.getByRole("region", { name: "This week", exact: true });
    await expect(week).toContainText("4:21");
    const row = (name: string) => week.getByRole("listitem").filter({ hasText: name });
    await expect(row("Brand refresh · Northwind")).toContainText("3:16");
    await expect(row("Admin · Northwind")).toContainText("0:45");
    await expect(row("General · No client")).toContainText("0:20");
    // Open each day: on a phone the week's list is paged, so Monday is not on its first page.
    const days = page.getByRole("navigation", { name: "This week" });
    await days.getByRole("button", { name: /^Monday, September 14/ }).click();
    await expect(page.getByText("Logo sketches, round 2").first()).toBeVisible(); // in the day and in the week list
    await days.getByRole("button", { name: /^Tuesday, September 15/ }).click();
    await expect(page.getByText("Invoices and email").first()).toBeVisible();
  });

  await test.step("the same file again: everything is already here, nothing to import", async () => {
    await pickSource(page, "Toggl Track", "Download CSV");
    const preview = await chooseFile(panel, TOGGL);
    await expect(preview).toContainText("4 already here");
    await expect(preview).toContainText("No new clients or projects");
    await expect(panel.getByRole("button", { name: "Nothing new to import" })).toBeDisabled();
  });
});
