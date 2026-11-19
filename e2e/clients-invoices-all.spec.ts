import type { Page } from "@playwright/test";

import { copyInvoices, expect, gotoClient, pickClient, renumberCopy, startDemo, test } from "./helpers";

// A client with 601 invoices: Clients counts every one in the Invoices tab label, and the tab reads them 200 at a time
// with "Load more" until the oldest is in. Another client's tab never shows Northwind's rows.

/** Northwind Studio's invoices: the sample's one and 600 copies, one renumbered as the oldest. */
const NORTHWIND_INVOICES = 601;
const OLDEST = "INV-1999-001";

async function seed601(page: Page) {
  await startDemo(page);
  const userId = await copyInvoices(page, 600, { clientName: "Northwind Studio" });
  renumberCopy(userId, { from: "INV-2099-600", to: OLDEST, issueDate: "2000-01-01" });
}

const profile = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const invoicesTab = (page: Page, name: string) => profile(page, name).getByRole("tab", { name: /^Invoices/ });
const rows = (page: Page, name: string) => profile(page, name).getByRole("tabpanel").getByRole("listitem");
const loadMore = (page: Page, name: string) => profile(page, name).getByRole("button", { name: "Load more" });

test("a client's Invoices tab counts all 601 and loads them 200 at a time, the oldest last", async ({ page }) => {
  await seed601(page);
  await gotoClient(page, "Northwind Studio");
  await expect(invoicesTab(page, "Northwind Studio")).toHaveText(`Invoices · ${NORTHWIND_INVOICES}`);

  await invoicesTab(page, "Northwind Studio").click();
  await expect(rows(page, "Northwind Studio")).toHaveCount(200);
  await expect(profile(page, "Northwind Studio").getByText("Showing 200 of 601", { exact: true })).toBeVisible();

  await loadMore(page, "Northwind Studio").click();
  await expect(rows(page, "Northwind Studio")).toHaveCount(400);
  await expect(profile(page, "Northwind Studio").getByText("Showing 400 of 601", { exact: true })).toBeVisible();

  await loadMore(page, "Northwind Studio").click();
  await expect(rows(page, "Northwind Studio")).toHaveCount(600);
  await loadMore(page, "Northwind Studio").click();
  await expect(rows(page, "Northwind Studio")).toHaveCount(NORTHWIND_INVOICES);
  await expect(loadMore(page, "Northwind Studio")).toHaveCount(0);
  await expect(rows(page, "Northwind Studio").last()).toContainText(OLDEST);
});

test("another client's Invoices tab never shows Northwind's rows", async ({ page }) => {
  await seed601(page);
  await gotoClient(page, "Northwind Studio");
  await invoicesTab(page, "Northwind Studio").click();
  await expect(rows(page, "Northwind Studio")).toHaveCount(200);

  // Picked in the page, not by reloading it, so the Northwind rows are still in its cache.
  const mine = "My own business";
  await pickClient(page, mine);
  await expect(invoicesTab(page, mine)).toHaveText("Invoices");
  await invoicesTab(page, mine).click();
  await expect(profile(page, mine).getByText(`No invoices for ${mine} yet.`)).toBeVisible();
  await expect(rows(page, mine)).toHaveCount(0);
  await expect(profile(page, mine).getByText(/INV-2099-/)).toHaveCount(0);
});
