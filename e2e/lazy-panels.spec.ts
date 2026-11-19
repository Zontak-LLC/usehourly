import { FEATURES } from "../src/lib/features";
import { downloadEverything, expect, firstClient, startFreshAccount, test, trpc, withSharedAccount } from "./helpers";

/**
 * The export and share panels load their code on first open, and "Download everything" loads its zip code on the click
 * (issue 425). Each one must still open, close and download the way it did when its code came with the page.
 */
const MENU = /^(Share & export|Export)$/;

test.describe("on the shared account", () => {
  withSharedAccount(); // opens and closes the panels only; reads no data

  test("Week: 'Send hours to a client' opens on first use and closes", async ({ page }) => {
    test.skip(!FEATURES.signOff, "Sign-off links are hidden in this release (src/lib/features.ts)");
    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: MENU }).click();
    await page.getByRole("menuitem", { name: "Send to a client for sign-off…" }).click();
    const panel = page.getByRole("region", { name: "Send hours to a client" });
    await expect(panel.getByRole("heading", { name: "Send hours to a client" })).toBeVisible();
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toHaveCount(0);
  });

  test("Week: 'Export a date range' opens on first use and closes", async ({ page }) => {
    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: MENU }).click();
    await page.getByRole("menuitem", { name: "Export a date range…" }).click();
    const panel = page.getByRole("region", { name: "Export a date range" });
    await expect(panel.getByLabel("From")).toBeVisible();
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toHaveCount(0);
  });
});

test("Account > Your data: Download everything starts the zip download on the click", async ({ page }) => {
  // A fresh account: the zip holds every entry, so it must not read the shared account (issue 340).
  await startFreshAccount(page, "Lazy Co");
  const client = await firstClient(page);
  await trpc(page, "entry.create", { projectId: client.projects[0].id, date: "2026-09-08", minutes: 30, note: "Lazy" });

  await page.goto("/dashboard/account#data");
  const card = page.getByRole("region", { name: "Download everything" });
  await expect(card).toBeVisible();
  // downloadEverything checks the name usehourly-export-<today in the browser zone>.zip and what the zip holds.
  const csv = await downloadEverything(page, card);
  expect(csv).toContain("Lazy");
});
