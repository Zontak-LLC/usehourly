import { expect, startFreshAccount, test } from "./helpers";

test("the export and share forms open under the toolbar, and follow the week when reopened", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/week");

  await page.getByRole("button", { name: /Share & export/ }).click();
  await page.getByRole("menuitem", { name: /Export a date range/ }).click();
  const panel = page.getByRole("region", { name: "Export a date range" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0); // a card in the page, not a pop-up
  const before = await panel.getByLabel("From").inputValue();

  // moving to another week and choosing the form again starts it from that week
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("button", { name: /Share & export/ }).click();
  await page.getByRole("menuitem", { name: /Export a date range/ }).click();
  await expect(panel.getByLabel("From")).not.toHaveValue(before);

  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
});
