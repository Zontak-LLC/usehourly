import { expect, test } from "@playwright/test";

test("on a phone the invoice card's buttons are all the same height", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the buttons only carry words on a phone");
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/invoices");
  const row = page.locator('[data-testid="invoice-actions"]:visible').first();
  await expect(row).toBeVisible();
  const heights = await row
    .locator("button:visible")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights.length).toBeGreaterThanOrEqual(3);
  expect(new Set(heights).size, `button heights ${heights.join(", ")}`).toBe(1);
});
