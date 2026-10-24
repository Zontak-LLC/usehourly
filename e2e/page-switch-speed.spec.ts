import { expect, startFreshAccount, test } from "./helpers";

/**
 * A page switch should feel instant. Two things make it so and are checked here in a real browser:
 * 1. once a page has settled, the busy tab pages' data is pre-cached, so opening Week asks the server for no entries;
 * 2. a slow switch shows a thin progress line at the top (the old page stays until the new one is in), and the line
 *    goes away when the new page arrives.
 */

test("Week opens on pre-cached entries after Today has settled", async ({ page }) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("1:30");
  await page.getByRole("button", { name: "Log time" }).click();
  await expect(
    page
      .getByRole("region", { name: /entries/i })
      .getByText("1:30")
      .first(),
  ).toBeVisible();
  // A fresh load of Today (logging time marks cached entries as stale, which is right: they changed).
  await page.reload();
  await expect(page.getByLabel("Time to add")).toBeVisible();
  // The pre-cache waits 3 seconds and an idle moment; give it room to finish.
  await page.waitForTimeout(5000);
  await page.waitForLoadState("networkidle");

  const asked: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/trpc/")) asked.push(decodeURIComponent(r.url().split("/api/trpc/")[1].split("?")[0]));
  });
  await page.getByRole("navigation", { name: "Main pages" }).getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("heading", { name: /Weekly timesheet/, level: 1 })).toBeVisible();
  // The entry logged on Today shows without waiting for the server: it came from the cache.
  await expect(page.getByText("1:30").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(asked.join(","), "Week should not ask for its entries again").not.toMatch(/entry\.list/);
});

test("a slow page switch shows the progress line until the page arrives", async ({ page }) => {
  await startFreshAccount(page);
  await page.waitForLoadState("networkidle");
  // Hold the Account page's server answer for 1.5 seconds, like a cold start.
  await page.route(/\/dashboard\/account(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const bar = page.getByTestId("route-progress");
  await expect(bar).toHaveCount(0);
  await page.getByRole("button", { name: /^Account menu for/ }).click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(bar).toBeVisible();
  // The old page is still there while it waits: nothing went blank.
  await expect(page.getByLabel("Time to add")).toBeVisible();
  await expect(page).toHaveURL(/dashboard\/account/, { timeout: 10_000 });
  await expect(bar).toHaveCount(0);
});
