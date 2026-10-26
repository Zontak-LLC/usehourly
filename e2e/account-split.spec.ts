import type { Page } from "@playwright/test";

import { auditPage, expect, startFreshAccount, test } from "./helpers";

/**
 * Account as a split view like Clients (issue 283): the sections on the left, each a link with one status line, the
 * chosen section on the right. The section is the address's #part, so a reload, a link and a search result open it; on
 * a phone the list and the section are two screens with "‹ Account" between them.
 */
const sections = (page: Page) => page.getByRole("navigation", { name: "Account sections" });
const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 2 });

const ROWS = [
  ["Your account", "account", /Confirm your email/],
  ["Invoices", "invoices", /USD · no business name yet/],
  ["Your data", "data", /1 client · 1 project/],
  ["API tokens & AI", "ai", /No tokens yet/],
] as const;

test("each section opens from the list, keeps its address on a reload, and the phone has a way back", async ({
  page,
  isPhone,
}) => {
  await startFreshAccount(page, "Acme Studio");
  await page.goto("/dashboard/account");
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();

  await test.step("with no #part a wide screen opens Your account; a phone shows only the list", async () => {
    await expect(sections(page)).toBeVisible();
    if (isPhone) await expect(heading(page, "Your account")).toBeHidden();
    else await expect(heading(page, "Your account")).toBeVisible();
    await auditPage(page, "account-list", isPhone);
  });

  await test.step("every row says its status, and opening it changes the address and shows only that section", async () => {
    for (const [name, id, status] of ROWS) {
      const row = sections(page).getByRole("link", { name: new RegExp(`^${name}`) });
      await expect(row).toContainText(status);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/account#${id}$`));
      await expect(heading(page, name)).toBeVisible();
      for (const [other] of ROWS) if (other !== name) await expect(heading(page, other)).toHaveCount(0);
      if (isPhone) {
        await expect(sections(page)).toBeHidden();
        await page.getByRole("link", { name: "Account", exact: true }).click();
        await expect(page).toHaveURL(/\/dashboard\/account$/);
        await expect(sections(page)).toBeVisible();
        await expect(heading(page, name)).toBeHidden();
      } else {
        await expect(row).toHaveAttribute("aria-current", "page");
      }
    }
  });

  await test.step("a reload keeps the section; Back returns to the screen before", async () => {
    await page.goto("/dashboard/account#data");
    await page.reload();
    await expect(heading(page, "Your data")).toBeVisible();
    // On a phone the list is a screen of its own: go back to it first.
    if (isPhone) await page.getByRole("link", { name: "Account", exact: true }).click();
    await sections(page)
      .getByRole("link", { name: /^Invoices/ })
      .click();
    await expect(heading(page, "Invoices")).toBeVisible();
    await page.goBack();
    // a phone goes back to the list it came from, a wide screen to the section before
    if (isPhone) await expect(sections(page)).toBeVisible();
    else await expect(heading(page, "Your data")).toBeVisible();
    await auditPage(page, "account-section", isPhone);
  });

  await test.step("the old #claim address opens Your account", async () => {
    await page.goto("/dashboard/account#claim");
    await expect(heading(page, "Your account")).toBeVisible();
  });

  await test.step("Support is the last row; it opens the donation page in a new tab and says so", async () => {
    if (isPhone) await page.goto("/dashboard/account");
    const support = sections(page).getByRole("link", { name: /^Support UseHourly/ });
    await expect(support).toHaveAttribute("target", "_blank");
    await expect(support).toHaveAttribute("href", /^https:\/\//);
    await expect(support).toHaveAccessibleName(/opens in a new tab/);
  });
});

test("a setting found by search opens its section, also from the Account page itself", async ({ page }) => {
  await startFreshAccount(page);
  const box = page.getByRole("combobox", { name: /Search pages, settings/ });
  await page.goto("/dashboard/account#ai");
  await expect(heading(page, "API tokens & AI")).toBeVisible();
  await page
    .getByRole("button", { name: "Search", exact: true })
    .filter({ hasText: /Search settings/ })
    .click();
  await box.fill("currency");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#invoices$/);
  await expect(heading(page, "Invoices")).toBeVisible();
  await expect(heading(page, "API tokens & AI")).toBeHidden();

  // from another page too
  await page.goto("/dashboard/week");
  await page.locator("header").getByRole("button", { name: "Search", exact: true }).click();
  await box.fill("export");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/account#data$/);
  await expect(heading(page, "Your data")).toBeInViewport({ timeout: 15_000 });
});
