import type { Page } from "@playwright/test";

import { auditPage, expect, signUpByApi, test } from "./helpers";

/**
 * The side column experiment (components/side-column.tsx): on a wide screen Week's "This week" card is min(its own
 * content, the main column): it stops level with a shorter main column and its rows scroll (never under 24rem), and keeps
 * its own height beside a taller one. On a phone the columns stack and the
 * card keeps its own height.
 */
const FLOOR = 24 * 16;
const PROJECTS = 12;

async function call<T>(page: Page, path: string, data: unknown): Promise<T> {
  const res = await page.request.post(`/api/trpc/${path}`, { data });
  expect(res.ok(), `${path} answered ${res.status()}`).toBe(true);
  return ((await res.json()) as { result: { data: T } }).result.data;
}

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

/** Twelve projects with time on Monday; the page then opens Tuesday, an empty day, so the main column is short. */
async function seed(page: Page) {
  await signUpByApi(page);
  await page.goto("/dashboard/today");
  const { monday, tuesday } = await thisWeek(page);
  const client = await call<{ id: string }>(page, "clients.create", { name: "Side Co" });
  for (let i = 1; i <= PROJECTS; i++) {
    const name = `Project ${String(i).padStart(2, "0")}`;
    const project = await call<{ id: string }>(page, "project.create", { clientId: client.id, name, hourlyRate: 5000 });
    await call(page, "entry.create", { projectId: project.id, date: monday, minutes: 15 * i, note: "" });
  }
  await page.goto(`/dashboard/week?date=${tuesday}`);
  const card = page.getByRole("region", { name: "This week" });
  await expect(card.getByRole("button", { name: /Project 12/ })).toBeAttached();
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
    };
  });
}

/** The rule in every state: the card is min(its own content, the main column, never under the floor when capped). */
function expectMinRule(m: Awaited<ReturnType<typeof measure>>) {
  expect(Math.abs(m.cardHeight - Math.min(m.natural, Math.max(m.mainHeight, FLOOR)))).toBeLessThanOrEqual(2);
}

test("on a wide screen the This week card is min(its content, the main column) and its rows scroll", async ({
  page,
  isPhone,
}) => {
  test.skip(isPhone, "the phone has its own test below");
  const card = await seed(page);
  const fold = page.getByRole("button", { name: /All entries this week/ });
  await expect(fold).toHaveAttribute("aria-expanded", "true");

  // List open (an empty day, the week's list under it): the main column is taller than the card's content, so the card
  // keeps its own height: its last row sits at its foot (no empty block), well above the main column's foot.
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

  // Folded: the main column is now shorter than the card's content, so the card stops level with it (never under the
  // floor) and its rows scroll.
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(async () => {
    m = await measure(page);
    expect(m.natural).toBeGreaterThan(Math.max(m.mainHeight, FLOOR));
    expectMinRule(m);
    expect(m.cardHeight).toBeGreaterThanOrEqual(FLOOR - 2);
    if (m.mainHeight > FLOOR) expect(Math.abs(m.cardBottom - m.mainBottom)).toBeLessThanOrEqual(2);
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
  await card.getByRole("button", { name: /Project 12/ }).focus();
  await expect(card.getByRole("button", { name: /Project 12/ })).toBeFocused();

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
