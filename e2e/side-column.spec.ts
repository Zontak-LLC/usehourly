import type { Page } from "@playwright/test";

import { auditPage, expect, signUpByApi, test, trpc } from "./helpers";

/**
 * The side column (components/side-column.tsx): on a wide screen Week's "This week" card is min(its own content, the
 * main column, the window): beside a taller main column it keeps its own height; in a short window it stops under the
 * top bar and its rows scroll. On a phone the columns stack and the card keeps its own height.
 */
const FLOOR = 24 * 16;
// One page of the By project list (pages of 10 since 2026-10-24); the pages have their own test below.
const PROJECTS = 10;

/** Monday and Tuesday of this week, in the browser's own time zone (the app works out "today" there). */
async function thisWeek(page: Page) {
  return page.evaluate(() => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const monday = iso(d);
    d.setDate(d.getDate() + 1);
    return { monday, tuesday: iso(d) };
  });
}

/** Ten projects with time on Monday (`count` to change it); the page then opens Tuesday, an empty day, so the main column is short. */
async function seed(page: Page, count = PROJECTS) {
  await signUpByApi(page);
  await page.goto("/dashboard/today");
  const { monday, tuesday } = await thisWeek(page);
  const client = await trpc<{ id: string }>(page, "clients.create", { name: "Side Co" });
  for (let i = 1; i <= count; i++) {
    const name = `Project ${String(i).padStart(2, "0")}`;
    const project = await trpc<{ id: string }>(page, "project.create", { clientId: client.id, name, hourlyRate: 5000 });
    await trpc(page, "entry.create", { projectId: project.id, date: monday, minutes: 15 * i, note: "" });
  }
  await page.goto(`/dashboard/week?date=${tuesday}`);
  const card = page.getByRole("region", { name: "This week", exact: true });
  await expect(card.getByRole("button", { name: /Project/ }).first()).toBeAttached();
  return card;
}

/** The card's and the main column's bottom edges, and the row list's scroll sizes. */
async function measure(page: Page) {
  return page.locator("[data-side-column]").evaluate((cell) => {
    const card = cell.querySelector('section[aria-label="This week"]') as HTMLElement;
    const list = cell.querySelector("[data-side-scroll]") as HTMLElement;
    const main = cell.nextElementSibling as HTMLElement;
    const rows = list.querySelectorAll("li");
    const cardBox = card.getBoundingClientRect();
    return {
      cardBottom: cardBox.bottom,
      cardHeight: cardBox.height,
      // The card's height if nothing capped it: its header plus every row.
      natural: cardBox.height - list.clientHeight + list.scrollHeight,
      lastRowBottom: rows[rows.length - 1].getBoundingClientRect().bottom,
      mainBottom: main.getBoundingClientRect().bottom,
      mainHeight: main.getBoundingClientRect().height,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      overflow: getComputedStyle(list).overflowY,
      windowCap: window.innerHeight - 7 * 16,
    };
  });
}

/** The rule in every state: the card is min(its own content, the main column, never under the floor when capped). */
function expectMinRule(m: Awaited<ReturnType<typeof measure>>) {
  // Also never taller than the window under the top bar (100dvh - 7rem).
  const cap = Math.min(Math.max(m.mainHeight, FLOOR), m.windowCap);
  expect(Math.abs(m.cardHeight - Math.min(m.natural, cap))).toBeLessThanOrEqual(2);
}

test("on a wide screen the This week card is min(its content, the main column) and its rows scroll", async ({
  page,
  isPhone,
}) => {
  test.skip(isPhone, "the phone has its own test below");
  // A tall window, so the card's own content fits under the window cap and the "keeps its own height" case shows.
  await page.setViewportSize({ width: 1280, height: 1100 });
  const card = await seed(page);
  await expect(page.getByRole("region", { name: "All entries this week" })).toBeVisible(); // always open, no fold

  // An empty day with the week's list under it: the main column is taller than the card's content, so the card keeps
  // its own height: its last row sits at its foot (no empty block), well above the main column's foot.
  let m = await measure(page);
  expect(m.mainHeight).toBeGreaterThan(m.natural + 50);
  expectMinRule(m);
  expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight + 1);
  expect(m.cardBottom - m.lastRowBottom).toBeLessThanOrEqual(4);
  expect(m.mainBottom - m.cardBottom).toBeGreaterThan(50);

  // Sticky: scrolled so the card's first place is above the window, the card stays under the top bar (6rem) while the
  // main column is still on screen.
  const STICKY_TOP = 6 * 16;
  const startTop = await page
    .locator('section[aria-label="This week"]')
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), startTop + 200);
  await expect(async () => {
    const at = await page.locator("[data-side-column]").evaluate((cell) => ({
      cardTop: (cell.querySelector('section[aria-label="This week"]') as HTMLElement).getBoundingClientRect().top,
      mainBottom: (cell.nextElementSibling as HTMLElement).getBoundingClientRect().bottom,
    }));
    expect(at.mainBottom).toBeGreaterThan(STICKY_TOP);
    expect(Math.abs(at.cardTop - STICKY_TOP)).toBeLessThanOrEqual(2);
  }).toPass();
  await page.evaluate(() => window.scrollTo(0, 0));

  // A short window: the card is never taller than the window under the top bar, so it stops there and its rows scroll.
  await page.setViewportSize({ width: 1280, height: 640 });
  await expect(async () => {
    m = await measure(page);
    expect(m.natural).toBeGreaterThan(m.windowCap);
    expectMinRule(m);
    expect(Math.abs(m.cardHeight - m.windowCap)).toBeLessThanOrEqual(2);
    expect(m.scrollHeight).toBeGreaterThan(m.clientHeight);
  }).toPass();

  // The header stays; the last row is out of sight until the list is scrolled, then it shows.
  const list = page.locator("[data-side-scroll]");
  // How far the last row's foot sits below the scroll box's foot (0 or less = fully inside it), and where the header is.
  const lastRow = () =>
    list.evaluate((el) => {
      const rows = el.querySelectorAll("li");
      const total = el.closest("section")?.querySelector("p") as HTMLElement;
      return {
        below: rows[rows.length - 1].getBoundingClientRect().bottom - el.getBoundingClientRect().bottom,
        headerTop: total.getBoundingClientRect().top,
      };
    });
  const before = await lastRow();
  expect(before.below).toBeGreaterThan(10);
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(async () => expect((await lastRow()).below).toBeLessThanOrEqual(1)).toPass();
  expect((await lastRow()).headerTop).toBeCloseTo(before.headerTop, 0); // the header did not move

  // The rows are buttons, so the keyboard reaches them inside the scroll box.
  await card.getByRole("button", { name: /Project 10/ }).focus();
  await expect(card.getByRole("button", { name: /Project 10/ })).toBeFocused();

  await auditPage(page, "week-side-column", isPhone);
});

test("on a phone the This week card keeps its own height", async ({ page, isPhone }) => {
  test.skip(!isPhone, "phone only");
  await seed(page);
  const m = await measure(page);
  expect(m.overflow).toBe("visible");
  expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight + 1);
  // Every project row is in the card's own height (twenty rows of at least 56px).
  expect(m.cardHeight).toBeGreaterThan(PROJECTS * 56);
  await auditPage(page, "week-side-column", isPhone);
});

test("By project shows 10 projects a page, and a picked project's page opens with it", async ({ page, isPhone }) => {
  test.skip(isPhone, "a phone scrolls the whole list (its own test below)");
  const card = await seed(page, 12);
  const rows = card.getByRole("listitem");
  const pages = card.getByRole("navigation", { name: "projects pages" });
  await expect(rows).toHaveCount(10);
  await expect(pages).toContainText("1–10 of 12");
  await pages.getByRole("button", { name: "Next page" }).click();
  await expect(rows).toHaveCount(2);
  await expect(pages).toContainText("11–12 of 12");
  // Pick one of the two on page 2, go back to page 1, then reload: the address keeps the project and its page opens.
  const name = (await rows.first().getByRole("button").innerText()).split("\n")[0];
  await rows.first().getByRole("button").click();
  await expect(page).toHaveURL(/project=/);
  await pages.getByRole("button", { name: "Previous page" }).click();
  await page.reload();
  await expect(card.getByRole("button", { name: new RegExp(name) })).toHaveAttribute("aria-pressed", "true");
  await expect(pages).toContainText("11–12 of 12");
});

test("By project is A to Z with a search box, and a phone lists every project with no pages", async ({
  page,
  isPhone,
}) => {
  const card = await seed(page, 12);
  const names = async () =>
    (await card.getByRole("listitem").allInnerTexts()).map((t) => t.split(/\s·\s|\n/)[0].trim());
  // A to Z (the seed logs more time on later projects, so the old order was by time, not name).
  const listed = await names();
  expect(listed).toEqual([...listed].sort((a, b) => a.localeCompare(b)));
  // The client shows beside each name.
  await expect(card.getByRole("listitem").first()).toContainText("Side Co");
  // On a phone: every project, no pages control.
  if (isPhone) {
    await expect(card.getByRole("listitem")).toHaveCount(12);
    await expect(card.getByRole("navigation", { name: "projects pages" })).toHaveCount(0);
  }
  // The search (from 9 projects) narrows the list; a project on page 2 is found from page 1.
  const search = card.getByRole("searchbox", { name: "Search projects" });
  await search.fill("project 12");
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await expect(card.getByRole("listitem")).toContainText("Project 12");
  await search.fill("nothing like this");
  await expect(card.getByText("No project matches that.")).toBeVisible();
  await search.fill("");
  await expect(card.getByRole("listitem")).toHaveCount(isPhone ? 12 : 10);
});
