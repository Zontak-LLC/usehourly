import { expect, startFreshAccount, test } from "./helpers";

/**
 * A returning visitor sees the last data at once. The saved copy is put back before the first paint, so the page does
 * not wait for the server: here the server's answers are held back for four seconds and the page must still show
 * the entry long before they arrive.
 */
test("reopening a page shows the last data immediately, while fresh data is still loading", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/today");
  await page.getByPlaceholder(/Time:/).fill("2h");
  await page.getByLabel("Description").fill("Instant open check");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(page.getByText("Instant open check")).toBeVisible();
  // the saved copy is written a moment after the data changes
  await page.waitForFunction(() => localStorage.getItem("hourly:queryCache")?.includes("Instant open check"));

  let held = 0;
  await page.route("**/api/trpc/**", async (route) => {
    held++;
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  const reopened = Date.now();
  await page.reload();
  // the entry is on screen from the saved copy, long before the held-back answers can arrive
  await expect(page.getByText("Instant open check")).toBeVisible({ timeout: 2500 });
  expect(Date.now() - reopened).toBeLessThan(3500);
  expect(held).toBeGreaterThan(0); // and the fresh data really was still on its way
});
