import { expect, signUpByApi, test } from "./helpers";
import { join } from "node:path";

const TOGGL = join(__dirname, "../src/__tests__/fixtures/toggl-detailed.csv");

/**
 * "Coming from Toggl, Clockify or Harvest?" on Today (issue 326): a new account sees where to bring its history over,
 * the link opens Account > Your data with Import history, "Not now" is remembered per account, and the note goes after
 * the first entry (logged or imported).
 */
test("a new account is pointed to the import on Today until it dismisses it or has an entry", async ({
  page,
  audit,
  shot,
}) => {
  const note = page.getByRole("note", { name: "Import your history" });
  await signUpByApi(page);
  await page.goto("/dashboard/today");

  await test.step("no projects yet: the note sits above the first-run question", async () => {
    await expect(note).toContainText("Coming from Toggl, Clockify or Harvest?");
    const question = page.getByText("Who do you work for?");
    await expect(question).toBeVisible();
    const [noteBox, questionBox] = [await note.boundingBox(), await question.boundingBox()];
    expect(noteBox && questionBox && noteBox.y < questionBox.y).toBe(true);
    await audit("today with the import hint");
    await shot("import-hint-first-run");
  });

  await test.step("the link opens Your data with the Import history section", async () => {
    await note.getByRole("link", { name: "Import your history" }).click();
    await expect(page).toHaveURL(/\/dashboard\/account#data$/);
    await expect(page.getByRole("region", { name: "Import history" })).toBeVisible();
  });

  await test.step("projects but no entries: the note sits above the day card", async () => {
    await page.goto("/dashboard/today");
    await page.getByPlaceholder(/company or a person/i).fill("Acme");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(note).toBeVisible();
    const days = page.getByRole("navigation", { name: "Days" });
    const [noteBox, daysBox] = [await note.boundingBox(), await days.boundingBox()];
    expect(noteBox && daysBox && noteBox.y < daysBox.y).toBe(true);
    await shot("import-hint-today");
  });

  await test.step("'Not now' hides it, and it stays hidden after a reload", async () => {
    await note.getByRole("button", { name: "Not now" }).click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(note).toHaveCount(0);
  });

  await test.step("a second account on the same browser still sees it, and it goes after the first entry", async () => {
    await signUpByApi(page);
    await page.goto("/dashboard/today");
    await page.getByPlaceholder(/company or a person/i).fill("Beta Co");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(note).toBeVisible();
    await page.getByLabel("Time to add").fill("1h");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(note).toHaveCount(0);
  });

  await test.step("an account that imported its history doesn't see it", async () => {
    await signUpByApi(page);
    await page.goto("/dashboard/account#data");
    const panel = page.getByRole("region", { name: "Import history" });
    await panel.getByText("Toggl Track", { exact: true }).click();
    await panel.locator('input[type="file"]').setInputFiles(TOGGL);
    await panel.getByRole("button", { name: /^Import \d+ entries/ }).click();
    await expect(panel.getByRole("status").filter({ hasText: /Imported \d+ entries/ })).toBeVisible();
    await page.goto("/dashboard/today");
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(note).toHaveCount(0);
  });
});
