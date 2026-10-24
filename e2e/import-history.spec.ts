import { expect, signUpByApi, test } from "./helpers";
import { join } from "node:path";

const HARVEST = join(__dirname, "../src/__tests__/fixtures/harvest-time-report.csv");

/**
 * "Move here in two minutes": someone coming from Harvest picks where their time is, follows the export steps, sees a
 * preview of what is new, imports, and finds the time on Week. The same file a second time adds nothing.
 */
test("a freelancer moves their Harvest history over and finds it on Week", async ({ page, audit, shot }) => {
  await signUpByApi(page);
  await page.goto("/dashboard/account#data");
  const panel = page.getByRole("region", { name: "Import history" });
  await expect(panel).toBeVisible();

  await test.step("pick Harvest: the steps to export the file show", async () => {
    await panel.getByText("Harvest", { exact: true }).click();
    await expect(panel.getByRole("radio", { name: "Harvest" })).toBeChecked();
    await expect(panel.getByRole("list", { name: "How to export the file" })).toContainText("Detailed report");
  });

  await test.step("the preview says what the file holds and what is new", async () => {
    await panel.locator('input[type="file"]').setInputFiles(HARVEST);
    const preview = panel.getByTestId("import-preview");
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
    await expect(page.getByRole("region", { name: "This week" })).toContainText("8:47");
    await expect(page.getByText("Accessibility audit, part 1")).toBeVisible();
    await expect(page.getByText("Quick call")).toBeVisible();
  });

  await test.step("the same file again: everything is already here, nothing to import", async () => {
    await page.goto("/dashboard/account#data");
    await panel.getByText("Harvest", { exact: true }).click();
    await panel.locator('input[type="file"]').setInputFiles(HARVEST);
    const preview = panel.getByTestId("import-preview");
    await expect(preview).toContainText("6 already here");
    await expect(preview).toContainText("No new clients or projects");
    await expect(panel.getByRole("button", { name: "Nothing new to import" })).toBeDisabled();
  });
});
