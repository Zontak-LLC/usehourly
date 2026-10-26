import { expect, test } from "@playwright/test";

import { openInvoice, startDemo } from "./helpers";

// The client always gets a white page, so "what your client sees" stays white paper in dark mode (2026-10-26).
test.use({ colorScheme: "dark" });
test("in dark mode the invoice preview is still light paper", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const { detail } = await openInvoice(page, 0);
  const card = detail.locator(".paper .bg-card").first();
  await expect(card).toBeVisible();
  const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, "the invoice's cards are white").toBe("rgb(255, 255, 255)");
});
