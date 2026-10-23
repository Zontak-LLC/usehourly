import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";

test("on a phone the invoice's buttons are all the same height", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the buttons only carry words on a phone");
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  const row = page.getByRole("region", { name: "Your invoices" }).getByRole("listitem").first();
  await expect(row).toBeVisible();
  // the row's action buttons (Mark paid, Share, Download, More), not the invoice number (a link-like button in the text)
  const heights = await row
    .getByRole("button")
    .filter({ hasNotText: /^INV-/ })
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights.length).toBeGreaterThanOrEqual(3);
  expect(new Set(heights).size, `button heights ${heights.join(", ")}`).toBe(1);
});
