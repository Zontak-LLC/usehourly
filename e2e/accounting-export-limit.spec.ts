import type { Page } from "@playwright/test";

import { type AccountingInvoice, XERO_MAX_LINES } from "../src/lib/accounting-export";
import { FEATURES } from "../src/lib/features";
import { downloadEverything, expect, signUpByApi, test, trpc, withSharedAccount } from "./helpers";

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

test.describe("on a fresh account", () => {
  // "Download everything" zips every entry of the account, so it may not run on the shared one (CLAUDE.md, issue 340):
  // there it would read what other spec files write at the same time.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Week: Export a date range opens its panel, and Download everything in it downloads the zip", async ({
    page,
  }) => {
    // The panel and the zip code load on first open and on the click (issue 425); this is the user's path through both.
    await signUpByApi(page);
    const client = await trpc<{ id: string }>(page, "clients.create", { name: "Range Co" });
    const project = await trpc<{ id: string }>(page, "project.create", {
      clientId: client.id,
      name: "General",
      hourlyRate: 0,
    });
    const note = "Range zip check";
    await trpc(page, "entry.create", { projectId: project.id, date: "2026-09-08", minutes: 45, note });

    await page.goto("/dashboard/week?date=2026-09-08");
    await page.getByRole("button", { name: /^(Share & export|Export)$/ }).click();
    await page.getByRole("menuitem", { name: "Export a date range…" }).click();
    const panel = page.getByRole("region", { name: "Export a date range" });
    await expect(panel).toBeVisible();
    const csv = await downloadEverything(page, panel);
    expect(csv).toContain(note);
    await expect(page.getByText("Downloaded 1 entry for 1 client.")).toBeVisible();
  });
});

test.describe("with no service worker", () => {
  // The built app's service worker (public/sw.js) fetches /_next/static/ itself, and page.route never sees what a
  // service worker fetches: with it on, the outage below would not happen and the panel would open.
  test.use({ serviceWorkers: "block" });

  test("Week: a panel whose code fails to load says so on every open, then opens once the network is back", async ({
    page,
  }) => {
    await page.goto("/dashboard/week?date=2026-09-08");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The h1 comes with the server's HTML, before the page's own scripts: on a slow CI machine failing chunks from there
    // also failed the toolbar's code, so the Export menu never answered. Wait until every page script has arrived.
    await page.waitForLoadState("networkidle");
    // Every script fetched from now on is the panel's own code (the page is loaded), so failing them all is the outage.
    await page.route("**/_next/static/chunks/**", (route) => route.abort());
    const menu = page.getByRole("button", { name: /^(Share & export|Export)$/ });
    const message = page.getByText("Could not load the export. Please try again.");
    for (let open = 0; open < 2; open++) {
      await menu.click();
      await page.getByRole("menuitem", { name: "Export a date range…" }).click();
      await expect(message).toBeVisible();
      await expect(page.getByRole("region", { name: "Export a date range" })).toBeHidden();
      await expect(message).toBeHidden({ timeout: 10_000 });
    }
    await page.unroute("**/_next/static/chunks/**");
    await menu.click();
    await page.getByRole("menuitem", { name: "Export a date range…" }).click();
    await expect(page.getByRole("region", { name: "Export a date range" })).toBeVisible();
  });
});

test("a file too long for Xero says so and downloads nothing; payments still download", async ({ page }) => {
  test.skip(!FEATURES.accountingExport, "The accounting export is hidden in this release (src/lib/features.ts)");
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
