import { expect, startFreshAccount, test } from "./helpers";

/**
 * The search in the top bar, on every signed-in page: one box finds pages, settings, clients and entries, and choosing a
 * result goes straight there.
 */
test("the top-bar search finds a setting, a client and an entry, and takes you there", async ({ page }) => {
  await startFreshAccount(page, "Zebra Studio");
  const search = page.locator("header").getByRole("button", { name: "Search", exact: true });
  const box = page.getByRole("combobox", { name: /Search pages, settings/ });

  // an entry to find later
  await page.getByLabel("Time to add").fill("1");
  await page.getByLabel("Description").fill("quarterly striped review");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(page.getByText("quarterly striped review").first()).toBeVisible();

  // the button is on every page, not just this one
  for (const path of ["/dashboard/week", "/dashboard/invoices", "/dashboard/account"]) {
    await page.goto(path);
    await expect(search).toBeVisible();
  }

  // a setting: typing "export" offers it, Enter scrolls to Your data on the Account page
  await search.click();
  await box.fill("export");
  await expect(page.getByRole("option", { name: /Export everything/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/account#data$/);
  await expect(page.getByRole("heading", { name: "Your data", level: 2 })).toBeInViewport({ timeout: 15_000 });

  // a client, found by name, from any page
  await search.click();
  await box.fill("zebra");
  await expect(page.getByRole("option", { name: /Zebra Studio/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);

  // the shortcut opens it too, and an entry's words find that entry; choosing it opens its day
  await page.keyboard.press("Control+k");
  await box.fill("striped review");
  const entry = page.getByRole("option", { name: /quarterly striped review/ });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/\/dashboard\/today\?date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText("quarterly striped review").first()).toBeVisible();

  // nothing found says so
  await search.click();
  await box.fill("qqqqzzzz");
  await expect(page.getByText(/Nothing found for/)).toBeVisible();
});
