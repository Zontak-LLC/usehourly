import { expect, test } from "@playwright/test";

import { openInvoice, startDemo } from "./helpers";

test("on a phone the invoice's buttons are all the same height, and big enough to tap", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "a phone check");
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  const { detail } = await openInvoice(page, 0);
  // the invoice's actions (Mark paid, Send or Write a reminder, Download, More)
  const heights = await detail
    .getByTestId("invoice-actions")
    .getByRole("button")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights.length).toBeGreaterThanOrEqual(3);
  expect(new Set(heights).size, `button heights ${heights.join(", ")}`).toBe(1);
  expect(heights[0]).toBeGreaterThanOrEqual(44);
});
