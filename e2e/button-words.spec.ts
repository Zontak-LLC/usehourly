import { expect, test } from "@playwright/test";

import { openInvoice, startDemo } from "./helpers";

// Buttons say what they do on a wide screen (walkthrough 2026-10-25: a lone arrow and a lone pencil were guesses).
// A phone keeps the square icons: its rows have no room, and each has a name for screen readers.
test("on a wide screen Download says PDF and Edit says Edit; a phone keeps the icons", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  const { number, detail } = await openInvoice(page, 0);
  const download = detail.getByRole("button", { name: `Download ${number} as a PDF` });
  await expect(download).toBeVisible();
  if (phone) await expect(download).not.toContainText("PDF");
  else await expect(download).toContainText("PDF");

  await page.goto("/dashboard/week");
  // The sample's entries are on the days before today: on a Monday this week is still empty, so look at last week.
  await page.getByRole("button", { name: "Previous week" }).click();
  const edit = page.getByRole("button", { name: "Edit", exact: true }).first();
  await expect(edit).toBeVisible();
  const word = edit.getByText("Edit", { exact: true });
  if (phone) await expect(word).toBeHidden();
  else await expect(word).toBeVisible();
});
