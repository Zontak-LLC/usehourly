import type { Page } from "@playwright/test";

import { type AccountingInvoice, XERO_MAX_LINES } from "../src/lib/accounting-export";
import { FEATURES } from "../src/lib/features";
import { expect, test, withSharedAccount } from "./helpers";

test.skip(!FEATURES.accountingExport, "The accounting export is hidden in this release (src/lib/features.ts)");
withSharedAccount();

/** One paid invoice with `lines` lines: one line past Xero's limit makes a file Xero would refuse. */
const longInvoice = (lines: number): AccountingInvoice => ({
  number: "INV-2026-001",
  issueDate: "2026-05-01",
  dueDate: "2026-05-31",
  paidDate: "2026-05-20",
  periodFrom: "2026-04-01",
  periodTo: "2026-04-30",
  totalCents: lines * 10000,
  notes: "",
  client: { name: "Acme", legalName: null, address: null, email: null },
  lines: Array.from({ length: lines }, (_, i) => ({
    project: `Project ${i}`,
    minutes: 60,
    rateCents: 10000,
    amountCents: 10000,
  })),
});

/**
 * Answers `accounting.invoices` with the long invoice. The real batch is fetched and only that procedure's answer is
 * replaced, so a batch that also carries another call still gets its real answer.
 */
async function fakeInvoices(page: Page, lines: number) {
  await page.route(
    (url) => url.pathname.includes("accounting.invoices"),
    async (route) => {
      const response = await route.fetch();
      const procedures = new URL(route.request().url()).pathname.replace(/^\/api\/trpc\//, "").split(",");
      const answers = (await response.json()) as unknown[];
      const data = { invoices: [longInvoice(lines)], more: false };
      const body = procedures.map((p, i) => (p === "accounting.invoices" ? { result: { data } } : answers[i]));
      await route.fulfill({ response, json: body });
    },
  );
}

test("a file too long for Xero says so and downloads nothing; payments still download", async ({ page }) => {
  await fakeInvoices(page, XERO_MAX_LINES + 1);
  await page.goto("/dashboard/account#data");
  const card = page.getByRole("region", { name: "Send invoices to your accounting app" });
  await expect(card).toBeVisible();

  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));

  await test.step("Xero: the message beside Download CSV, and no file", async () => {
    await expect(card.getByLabel("Send to")).toHaveValue("xero");
    await card.getByRole("button", { name: "Download CSV" }).click();
    await expect(card.getByRole("alert")).toHaveText(
      "This range makes 501 lines; Xero takes up to 500 per file. Pick a shorter date range.",
    );
    await expect(card.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    // a download would have started by now; give it a moment to show up if it was going to
    await page.waitForTimeout(500);
    expect(downloads).toEqual([]);
    // no sideways scroll on a phone with the message in the strip
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  await test.step("Payments received has no limit: the message goes and the file downloads", async () => {
    await card.getByLabel("Send to").selectOption("payments");
    await expect(card.getByRole("alert")).toHaveCount(0);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^usehourly-payments-\d{4}\.csv$/);
  });
});
