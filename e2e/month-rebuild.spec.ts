import type { Page } from "@playwright/test";

import { auditPage, expect, shownMonth, startFreshAccount, test, trpc } from "./helpers";

/**
 * Month (2026-10-24 rebuild): the calendar on the left, and on the right one day (‹ › steps, its entries, Log time behind
 * one button) or the whole month's list. The address holds the month, the day and the view. March 2026 is used, so the
 * dates never depend on today.
 */
const MARCH = "/dashboard/month?month=2026-03";

/** A fresh account with time on March 30 (1:00 Alpha, 2:00 Beta) and March 31 (1:30 Gamma), plus `extra` short days. */
async function seed(page: Page, extra = 0) {
  await startFreshAccount(page, "Acme");
  const res = await page.request.get("/api/trpc/clients.list");
  const clients = ((await res.json()) as { result: { data: { projects: { id: string }[] }[] } }).result.data;
  const projectId = clients[0].projects[0].id;
  const add = (date: string, minutes: number, note: string) =>
    trpc(page, "entry.create", { projectId, date, minutes, note });
  await add("2026-03-30", 60, "Alpha work");
  await add("2026-03-30", 120, "Beta work");
  await add("2026-03-31", 90, "Gamma work");
  for (let i = 0; i < extra; i++) await add(`2026-03-${String(2 + i).padStart(2, "0")}`, 30, `Filler ${i + 1}`);
}

const cell = (page: Page, date: string) => page.getByRole("button", { name: new RegExp(`^${date}: `) });
const dayCard = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("a picked day shows on the right, ‹ › step days across the month's edge, and the address keeps it", async ({
  page,
  isPhone,
}) => {
  await seed(page);
  await page.goto(MARCH);
  // Not this month, so it opens on the last day with time.
  await expect(dayCard(page, "Tuesday, March 31")).toContainText("Gamma work");
  await expect(cell(page, "2026-03-31")).toHaveAttribute("aria-pressed", "true");

  await cell(page, "2026-03-30").click();
  await expect(page).toHaveURL(/date=2026-03-30/);
  const monday = dayCard(page, "Monday, March 30");
  await expect(monday).toContainText("Alpha work");
  await expect(monday).toContainText("Beta work");
  await expect(cell(page, "2026-03-30")).toHaveAttribute("aria-pressed", "true");

  await test.step("‹ › step days and cross into the next month and back", async () => {
    await monday.getByRole("button", { name: "Next day" }).click();
    await expect(dayCard(page, "Tuesday, March 31")).toBeVisible();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/month=2026-04.*date=2026-04-01|date=2026-04-01.*month=2026-04/);
    await expect(shownMonth(page)).toHaveText("April 2026");
    await expect(cell(page, "2026-04-01")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(shownMonth(page)).toHaveText("March 2026");
    await expect(dayCard(page, "Tuesday, March 31")).toContainText("Gamma work");
  });

  await test.step("a reload comes back to the same day", async () => {
    await page.reload();
    await expect(dayCard(page, "Tuesday, March 31")).toContainText("Gamma work");
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await auditPage(page, "month-day", isPhone);
});

test("Log time on <day> opens the form in place, and the time lands on that day and in the calendar", async ({
  page,
}) => {
  await seed(page);
  await page.goto(`${MARCH}&date=2026-03-31`);
  const card = dayCard(page, "Tuesday, March 31");
  await expect(card.getByLabel("Time to add")).toHaveCount(0); // closed until asked for
  const open = card.getByRole("button", { name: "Log time on Mar 31" });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await card.getByLabel("Time to add").fill("2");
  await card.getByLabel("Description").fill("Delta work");
  await card.getByRole("button", { name: /^Log time/ }).click(); // the form's own button (the toggle now says Hide the form)
  await expect(card).toContainText("Delta work");
  await expect(cell(page, "2026-03-31")).toHaveAccessibleName(/^2026-03-31: 3:30/);
  // The same button closes the form again.
  const hide = card.getByRole("button", { name: "Hide the form" });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await hide.click();
  await expect(card.getByLabel("Time to add")).toHaveCount(0);
});

test("Whole month lists every entry, the search narrows it, and a day in it opens that day", async ({ page }) => {
  await seed(page);
  await page.goto(MARCH);
  await page.getByRole("button", { name: "Whole month", exact: true }).click();
  await expect(page).toHaveURL(/view=month/);
  const list = page.getByRole("region", { name: "All entries this month" });
  await expect(list.getByRole("heading", { level: 2 })).toHaveText("All entries this month (3)");

  await list.getByRole("searchbox", { name: "Search entries" }).fill("beta");
  await expect(list.getByRole("heading", { level: 2 })).toHaveText("All entries this month (1)");
  await list.getByRole("searchbox", { name: "Search entries" }).fill("");

  await page.reload(); // the view is in the address
  await expect(list).toBeVisible();

  await list.getByRole("button", { name: "Open Monday, March 30" }).click();
  await expect(page).toHaveURL(/date=2026-03-30/);
  await expect(page).not.toHaveURL(/view=month/);
  await expect(page.getByRole("button", { name: "Day", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dayCard(page, "Monday, March 30")).toContainText("Alpha work");

  await page.goBack(); // Back returns to the whole month
  await expect(page.getByRole("region", { name: "All entries this month" })).toBeVisible();
});

test("an entry dragged from the day onto another calendar day moves there, and Undo moves it back", async ({
  page,
  isPhone,
}) => {
  test.skip(isPhone, "dragging is a mouse shortcut; a phone moves an entry with its Day field");
  await seed(page);
  await page.goto(`${MARCH}&date=2026-03-31`);
  await page.getByRole("button", { name: /^Drag General 1:30 to another day/ }).dragTo(cell(page, "2026-03-25"));
  await expect(page.getByText("Moved to Wednesday, March 25.")).toBeVisible();
  await expect(cell(page, "2026-03-25")).toHaveAccessibleName(/^2026-03-25: 1:30/);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, "2026-03-31")).toHaveAccessibleName(/^2026-03-31: 1:30/);
  await expect(cell(page, "2026-03-25")).toHaveAccessibleName(/^2026-03-25: 0:00/);
});

test("on a wide screen the calendar stays in view while the right side scrolls", async ({ page, isPhone }) => {
  test.skip(isPhone, "on a phone the calendar comes first and scrolls with the page");
  await page.setViewportSize({ width: 1280, height: 700 });
  await seed(page, 12);
  await page.goto(`${MARCH}&view=month`);
  const list = page.getByRole("region", { name: "All entries this month" });
  await expect(list).toBeVisible();
  const calendar = page.getByRole("region", { name: "Calendar" });
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect(async () => {
    const top = (await calendar.boundingBox())?.y ?? 0;
    expect(Math.abs(top - 6 * 16)).toBeLessThanOrEqual(2); // under the top bar (6rem)
    const listBox = await list.boundingBox();
    expect((listBox?.y ?? 0) + (listBox?.height ?? 0)).toBeGreaterThan(700); // the list still runs on below
  }).toPass();
});

test("on a phone the calendar comes first, then the switch and the day", async ({ page, isPhone }) => {
  test.skip(!isPhone, "phone only");
  await seed(page);
  await page.goto(MARCH);
  const calendar = await page.getByRole("region", { name: "Calendar" }).boundingBox();
  const switcher = await page.getByRole("group", { name: "Show" }).boundingBox();
  const day = await dayCard(page, "Tuesday, March 31").boundingBox();
  expect((calendar?.y ?? 0) + (calendar?.height ?? 0)).toBeLessThanOrEqual((switcher?.y ?? 0) + 1);
  expect(switcher?.y ?? 0).toBeLessThan(day?.y ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
