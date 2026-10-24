import { expect, type Page, test } from "@playwright/test";

import { YEAR_SECTIONS } from "../src/lib/year-sections";
import { startDemo } from "./helpers";

/**
 * The Year summary as a split view, like Account: the sections as rows on the left (each a link to its #address), the
 * chosen one on the right; a phone shows the list, then the section with "‹ Year summary". Printing prints them all.
 */
const SHOWN = YEAR_SECTIONS.filter((s) => s.id !== "expenses"); // Expenses is switched off in this release
const list = (page: Page) => page.getByRole("navigation", { name: "Year summary sections" });
const pane = (page: Page, label: string) => page.getByRole("heading", { level: 2, name: label, exact: true });

test("each section opens from the list, the address names it, and reload and Back keep it", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await startDemo(page);
  await page.goto("/dashboard/report");
  await expect(page.getByRole("heading", { level: 1, name: /^Year summary · \d{4}$/ })).toBeVisible();

  if (phone) {
    // A phone with no #part shows the list, and no section yet.
    await expect(list(page)).toBeVisible();
    await expect(pane(page, "Your year")).toBeHidden();
  } else {
    // A wide screen with no #part shows Your year beside the list, its row marked as the current one.
    await expect(pane(page, "Your year")).toBeVisible();
    await expect(list(page).getByRole("link", { name: /^Your year/ })).toHaveAttribute("aria-current", "page");
  }

  for (const s of SHOWN) {
    const row = list(page).getByRole("link", { name: new RegExp(`^${s.label}`) });
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/report#${s.id}$`));
    await expect(pane(page, s.label)).toBeVisible();
    // Only the chosen section shows; the others wait their turn.
    for (const other of SHOWN.filter((o) => o.id !== s.id)) await expect(pane(page, other.label)).toBeHidden();
    if (phone) {
      await expect(list(page)).toBeHidden();
      await page.getByRole("link", { name: "Year summary", exact: true }).click(); // the phone's "‹ Year summary"
      await expect(page).toHaveURL(/\/dashboard\/report$/);
      await expect(list(page)).toBeVisible();
    } else {
      await expect(row).toHaveAttribute("aria-current", "page");
    }
  }

  // Reload keeps the section; Back returns to where you were (the section before, or a phone's list).
  await list(page)
    .getByRole("link", { name: /^By quarter/ })
    .click();
  await expect(pane(page, "By quarter")).toBeVisible();
  if (phone) await page.getByRole("link", { name: "Year summary", exact: true }).click();
  await list(page)
    .getByRole("link", { name: /^Clients and projects/ })
    .click();
  await expect(pane(page, "Clients and projects")).toBeVisible();
  await page.reload();
  await expect(pane(page, "Clients and projects")).toBeVisible();
  await page.goBack();
  if (phone) {
    await expect(page).toHaveURL(/\/dashboard\/report$/);
    await expect(list(page)).toBeVisible();
  } else {
    await expect(page).toHaveURL(/#quarters$/);
    await expect(pane(page, "By quarter")).toBeVisible();
  }
});

test("?year= and #clients together open that year's clients", async ({ page }) => {
  await startDemo(page);
  const last = new Date().getFullYear(); // the sample data is this year's; an empty year shows no sections
  await page.goto(`/dashboard/report?year=${last}#clients`);
  await expect(page.getByRole("heading", { level: 1, name: `Year summary · ${last}` })).toBeVisible();
  await expect(pane(page, "Clients and projects")).toBeVisible();
  // Picking another section keeps the year in the address.
  if (await list(page).isVisible()) {
    await list(page)
      .getByRole("link", { name: /^By month/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`\\?year=${last}#months$`));
    await expect(page.getByRole("heading", { level: 1, name: `Year summary · ${last}` })).toBeVisible();
  }
});

test("the list's lines and figures come from the year's own numbers", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the same rows; checked once");
  await startDemo(page);
  await page.goto("/dashboard/report#year");
  // Received leads Your year, and By quarter's figure is the year's Earned, as the Your year lines say.
  const received = await page
    .getByRole("region", { name: /^Money in/ })
    .locator("p")
    .first()
    .innerText();
  await expect(list(page).getByRole("link", { name: /^Your year/ })).toContainText(received);
  await expect(list(page).getByRole("link", { name: /^Your year/ })).toContainText("unpaid");
  const earned = page
    .getByRole("region", { name: /^Money in/ })
    .locator("dt", { hasText: "Earned" })
    .locator("..");
  const earnedValue = await earned.locator("dd").innerText();
  await expect(list(page).getByRole("link", { name: /^By quarter/ })).toContainText(earnedValue);
  await expect(list(page).getByRole("link", { name: /^Clients and projects/ })).toContainText(
    /\d+ clients? · \d+ projects?/,
  );
});

test("printing prints the whole year: every section, no list", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/report#invoices");
  await expect(pane(page, "Invoices issued")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  for (const s of SHOWN) await expect(pane(page, s.label)).toBeVisible();
  await expect(list(page)).toBeHidden();
  await expect(page.getByRole("region", { name: "Monthly bars" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await expect(pane(page, "By quarter")).toBeHidden();
});
