import { expect, test } from "@playwright/test";

import { openInvoice, startDemo } from "./helpers";

// A demo account cannot make invoice links, so the Send panel says the email has none. That is expected, so it is a
// calm note, not a red error (walkthrough 2026-10-25: the red note looked like something had broken).
test("in the demo, Send says calmly that the email has no link and the PDF is to attach", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  const { number } = await openInvoice(page, 0);
  await page.getByRole("button", { name: `Send ${number}` }).click();
  const panel = page.getByRole("region", { name: `Send invoice ${number}` });
  const note = panel.getByText(/Create a free account to share invoices/);
  await expect(note).toBeVisible();
  await expect(note).toContainText("attach the PDF yourself");
  const red = await note.evaluate((el) => Boolean(el.closest(".text-destructive")));
  expect(red, "the demo note is not styled as an error").toBe(false);
});
