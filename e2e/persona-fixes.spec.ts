import type { Page } from "@playwright/test";

import { toISODate } from "../src/lib/dates";
import { ENTRY_GONE } from "../src/lib/entry-gone";
import { FEATURES } from "../src/lib/features";
import {
  entryAction,
  expect,
  gotoClient,
  openEntryEdit,
  seedFirstDay,
  sql,
  startFreshAccount,
  test,
  trpc,
} from "./helpers";

/** Found by the persona walkthrough (ticket #179): three things that tripped a first-time freelancer. */

test("a project with no rate has an empty rate box with a hint, so typing 95 makes $95 and not $0.0095", async ({
  page,
}) => {
  await startFreshAccount(page, "Northwind Studio");
  await gotoClient(page, "Northwind Studio");
  await page.getByRole("button", { name: /^Edit General$/ }).click();
  const rate = page.getByLabel("Rate per hour");
  await expect(rate).toHaveValue(""); // not a real "0.00" that typing would land inside
  await expect(rate).toHaveAttribute("placeholder", "0.00");
  await rate.click();
  await page.keyboard.type("95");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("$95.00/h").first()).toBeVisible();

  // with a rate set, a click selects it, so typing replaces it
  await page.getByRole("button", { name: /^Edit General$/ }).click();
  await expect(rate).toHaveValue("95.00");
  await rate.click();
  await page.keyboard.type("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("$100.00/h").first()).toBeVisible();
});

test("picking the first day in Add to several days does not make the calendar jump", async ({ page }) => {
  test.skip(!FEATURES.multiDay, "'Add to several days' is hidden in this release (src/lib/features.ts)");
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/month");
  await page.getByRole("button", { name: "Add to several days" }).click();
  const thisMonth = toISODate(new Date()).slice(0, 7);
  const day = page.getByRole("button", { name: new RegExp(`^${thisMonth}-10`) });
  // where the day sits on the whole page (not on the screen: the page may scroll to the clicked day)
  const top = () => day.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await day.click();
  await expect(page.getByText("1 day selected")).toBeVisible();
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
});

/** Round two of the persona walkthrough (#181 to #184 and two more). */

test("the budget bar sits under the Add button, so it never moves the controls above it (#181)", async ({ page }) => {
  test.skip(!FEATURES.budgets, "Project budgets are hidden in this release (src/lib/features.ts)");
  const user = await startFreshAccount(page, "Acme");
  sql(
    `UPDATE projects SET budget_amount = 500000, budget_unit = 'dollars', budget_period = 'month' WHERE user_id = (SELECT id FROM auth_users WHERE email = '${user.email}')`,
  );
  await page.goto("/dashboard/today");
  const bar = page.getByText(/^Budget:/);
  await expect(bar).toBeVisible();
  const add = await page.getByRole("button", { name: /^Log time/ }).boundingBox();
  const budget = await bar.boundingBox();
  expect(budget?.y ?? 0).toBeGreaterThan((add?.y ?? 0) + (add?.height ?? 0)); // below the button, not above the time box
});

test("a sign-off link must name a client or project when there are several clients (#182)", async ({ page }) => {
  test.skip(!FEATURES.signOff, "Sign-off links are hidden in this release (src/lib/features.ts)");
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "New client" }).click();
  await page.getByLabel("New client name").fill("Beta");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Beta").filter({ visible: true }).first()).toBeVisible();
  await page.goto("/dashboard/month");
  await page.getByRole("button", { name: "Share & export" }).click();
  await page.getByRole("menuitem", { name: /Send to a client for sign-off/ }).click();

  const make = page.getByRole("button", { name: "Make a link" });
  const scope = page.getByLabel("Which work");
  await expect(scope).toHaveValue(""); // nothing chosen, and not "Everything"
  await expect(make).toBeDisabled();
  await scope.selectOption({ label: "Everything (every client)" });
  await expect(page.getByText(/This link lists every client and project/)).toBeVisible();
  await expect(make).toBeEnabled();
  await scope.selectOption({ label: "All of Acme" });
  await expect(page.getByText(/This link lists every client/)).toHaveCount(0);
  await expect(make).toBeEnabled();
});

test("the several-days panel does not change which project Today starts on (#183)", async ({ page }) => {
  test.skip(!FEATURES.multiDay, "'Add to several days' is hidden in this release (src/lib/features.ts)");
  await startFreshAccount(page, "Acme");
  await gotoClient(page, "Acme");
  await page.getByRole("button", { name: "Add a project for Acme" }).first().click();
  await page.getByLabel("Project name").fill("Zeta");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Zeta").first()).toBeVisible();

  await page.goto("/dashboard/month");
  await page.getByRole("button", { name: "Add to several days" }).click();
  const thisMonth = toISODate(new Date()).slice(0, 7);
  await page.getByRole("button", { name: new RegExp(`^${thisMonth}-10`) }).click();
  await page.getByLabel("Hours per day").fill("1");
  // Zeta, made last, is the project Today starts on (issue 431); the panel logs to General and must not change that.
  await page.locator("select").filter({ hasText: "General" }).first().selectOption({ label: "General" });
  await page.getByRole("button", { name: /^Create 1 entr/ }).click();
  await expect(page.getByText(/Created 1 entr/)).toBeVisible();

  await page.goto("/dashboard/today");
  await expect(page.getByRole("radio", { name: /Zeta/ })).toBeChecked();
});

test("the Month toolbar and calendar fit a 1,030px window (#184)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a wide-screen layout rule");
  await page.setViewportSize({ width: 1030, height: 800 });
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/month");
  await page.getByRole("button", { name: "Previous month" }).click(); // "This month" shows only away from this month
  const thisMonth = page.getByRole("button", { name: "This month" });
  const right = (await thisMonth.boundingBox())?.x ?? 0;
  const box = await thisMonth.boundingBox();
  expect(right + (box?.width ?? 0)).toBeLessThanOrEqual(1030 - 4);
  // the calendar's last column is inside its card
  const card = page.getByRole("region", { name: /./ }).first();
  void card;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a page does not scroll itself down to the add form when it opens (#179)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the time box takes focus on a computer, not on a phone");
  await page.setViewportSize({ width: 1024, height: 460 }); // short: the form is below the fold
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/week");
  await expect(page.getByLabel("Time to add")).toBeFocused(); // the focus is what used to scroll the page
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("a project can be added as not billable, with no rate and no red warning (#179)", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  await gotoClient(page, "Acme");
  await page.getByRole("button", { name: "Add a project for Acme" }).first().click();
  await page.getByLabel("Project name").fill("Admin and invoicing");
  await page.getByLabel("Not billable").check();
  await expect(page.getByLabel("Rate per hour")).toBeDisabled();
  await page.keyboard.press("Enter");
  const row = page.getByRole("listitem").filter({ hasText: "Admin and invoicing" });
  await expect(row.getByText("non-billable")).toBeVisible();
  await expect(row.getByText("No hourly rate yet")).toHaveCount(0);
});

// Issue 458 (Sentinel, 2026-11-08): saving an entry that another tab or device had deleted gave a server error.
test.describe("an entry deleted in another tab", () => {
  /** One entry on Today, its row (found by id: a row filtered by its note stops matching while the note is in a box). */
  async function oneEntryOnToday(page: Page) {
    await seedFirstDay(page, { rate: 0, minutes: [60] });
    await page.goto("/dashboard/today");
    const entries = page.getByRole("region", { name: "Today's entries" });
    await expect(entries.getByText("Logo concepts for the homepage")).toBeVisible();
    const id = await entries.getByRole("listitem").first().getAttribute("data-entry-id");
    if (!id) throw new Error("the entry row has no id");
    return { id, row: entries.locator(`li[data-entry-id="${id}"]`) };
  }

  test("Save says it was deleted, keeps the form closed and drops the row", async ({ page }) => {
    const { id, row } = await oneEntryOnToday(page);
    const card = await openEntryEdit(row);
    await card.getByLabel("Time", { exact: true }).fill("2:00");
    await trpc(page, "entry.delete", { id }); // what the second tab does, finished before Save
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(ENTRY_GONE)).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit", exact: true, expanded: true })).toHaveCount(0);
  });

  test("Delete entry says it was deleted, and the row does not come back", async ({ page }) => {
    const { id, row } = await oneEntryOnToday(page);
    await entryAction(row, "Delete");
    const ask = row.getByRole("region", { name: "Delete this entry?" });
    await expect(ask).toBeVisible();
    await trpc(page, "entry.delete", { id });
    const listed = page.waitForResponse((r) => r.url().includes("entry.list"));
    await ask.getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText(ENTRY_GONE)).toBeVisible();
    await listed; // the list was read again after the refusal
    await expect(row).toHaveCount(0);
    await expect(page.getByText("Entry deleted.")).toHaveCount(0);
  });
});
