import { expect, startFreshAccount, test } from "./helpers";

test("the non-billable day button shows a check mark and a selected look when it is on", async ({ page, shot }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/week");
  const button = page.getByRole("button", { name: /Mark day non-billable|Non-billable day/ }).first();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button.locator("svg[data-icon='no-dollar']")).toBeVisible();
  await shot("non-billable-off");
  const before = await button.evaluate((el) => getComputedStyle(el).borderColor);

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button.locator("svg.lucide-check")).toBeVisible(); // the check mark
  await expect(button.locator("svg[data-icon='no-dollar']")).toHaveCount(0);
  // it looks selected: the outline is darker than when it is off
  expect(await button.evaluate((el) => getComputedStyle(el).borderColor)).not.toBe(before);
  // the check takes the button's own text colour (not the global green)
  const colours = await button.evaluate((el) => ({
    text: getComputedStyle(el).color,
    icon: getComputedStyle(el.querySelector("svg.lucide-check") as Element).color,
  }));
  expect(colours.icon).toBe(colours.text);

  await button.click(); // click again to clear it
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button.locator("svg[data-icon='no-dollar']")).toBeVisible();
});

test("the dark-mode choice lives in the gear menu, not as a second button in the top bar", async ({ page }) => {
  await startFreshAccount(page);
  await expect(page.getByRole("button", { name: /Current theme/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Appearance and layout settings" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByText("Theme Preset")).toBeVisible();
  await expect(menu.getByText("Theme Mode")).toBeVisible();
  await expect(menu.getByRole("radio", { name: "Toggle dark" })).toBeVisible();

  // a signed-out visitor has no gear, so the guide keeps the quick switch for them
  const visitor = await page
    .context()
    .browser()
    ?.newContext({ baseURL: page.url().split("/dashboard")[0] });
  const anon = await visitor?.newPage();
  await anon?.goto("/help");
  await expect(anon?.getByRole("button", { name: /Current theme/ }) ?? page.locator("none")).toBeVisible();
  await visitor?.close();
});

test("the hours on an entry are plain text: only the pencil opens the edit form", async ({ page }) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("2");
  await page.getByLabel("Description").fill("hours are not a button");
  await page.getByRole("button", { name: /^Add to the day/ }).click();
  const row = page.getByRole("listitem").filter({ hasText: "hours are not a button" }).first();
  await expect(row).toBeVisible();
  const hours = row.getByText("2:00", { exact: true });
  await expect(hours).toBeVisible();
  await expect(row.getByRole("button", { name: "2:00" })).toHaveCount(0); // not a button
  await hours.click();
  await expect(row.getByLabel("Time", { exact: true })).toHaveCount(0); // clicking it opens nothing
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(row.getByLabel("Time", { exact: true })).toBeVisible(); // the pencil does
});
