import { expect, sql, startFreshAccount, test } from "./helpers";

/**
 * The owner's "chip in" note on Today. The owner's switch lives on Insights (needs the admin allow-list), so the browser
 * test flips the saved setting directly and checks what a signed-in person sees.
 */
const set = (value: string | null) =>
  sql(
    value === null
      ? "DELETE FROM app_settings WHERE key = 'support_notice';"
      : `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('support_notice', '${value}');`,
  );

test.afterAll(() => set(null));

test("the note appears on Today only while the owner has it on, links to the sponsors page, and 'Not now' is remembered per amount", async ({
  page,
  shot,
}) => {
  set(null);
  await startFreshAccount(page);
  const note = page.getByRole("note", { name: "Support UseHourly" });

  await test.step("off by default: nothing on Today", async () => {
    await expect(page.getByRole("heading", { name: /Today/ }).first()).toBeVisible();
    await expect(note).toHaveCount(0);
  });

  await test.step("switched on: the amount and a link to the sponsors page", async () => {
    set('{"on":true,"cost":25}');
    await page.reload();
    await expect(note).toContainText("about $25 a month");
    await shot("support-notice");
    await expect(note.getByRole("link", { name: "Chip in" })).toHaveAttribute(
      "href",
      "https://github.com/sponsors/Zontak-LLC",
    );
  });

  await test.step("only on Today, not on other pages", async () => {
    await page.goto("/dashboard/week");
    await expect(page.getByRole("heading", { name: /Week/ }).first()).toBeVisible();
    await expect(note).toHaveCount(0);
    await page.goto("/dashboard/today");
    await expect(note).toBeVisible();
  });

  await test.step("'Not now' hides it, and it stays hidden after a reload", async () => {
    await note.getByRole("button", { name: "Not now" }).click();
    await expect(note).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Today/ }).first()).toBeVisible();
    await expect(note).toHaveCount(0);
  });

  await test.step("a different amount is a new note and shows again", async () => {
    set('{"on":true,"cost":60}');
    await page.reload();
    await expect(note).toContainText("about $60 a month");
  });

  await test.step("switched off again: gone", async () => {
    set('{"on":false,"cost":60}');
    await page.reload();
    await expect(page.getByRole("heading", { name: /Today/ }).first()).toBeVisible();
    await expect(note).toHaveCount(0);
  });
});
