import type { Page } from "@playwright/test";

import { icsFor } from "./calendar-fixture";
import { expect, startFreshAccount, test } from "./helpers";

/** A real touch gesture (the Chrome protocol's touch events), not a click. */
async function swipe(page: Page, from: [number, number], to: [number, number]) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps;
    const y = from[1] + ((to[1] - from[1]) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** The address must not change: give a wrongly started navigation time to happen before checking (a check right away passes either way). */
async function stays(page: Page, url: RegExp) {
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(url);
}

test("on a phone, swiping sideways moves through the tab bar's pages in order", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "swipe navigation is for touch screens");
  await startFreshAccount(page);
  const w = page.viewportSize()?.width ?? 412;
  // along the page header, which has no text field or scroller under the thumb
  const left = (page: Page) => swipe(page, [w - 130, 118], [40, 124]);
  const right = (page: Page) => swipe(page, [40, 118], [w - 130, 124]);

  await page.goto("/dashboard/today");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

  await left(page);
  await expect(page).toHaveURL(/\/dashboard\/week/);
  await left(page);
  await expect(page).toHaveURL(/\/dashboard\/month/);
  await right(page);
  await expect(page).toHaveURL(/\/dashboard\/week/);
  await right(page);
  await expect(page).toHaveURL(/\/dashboard\/today/);

  // the first tab has nothing before it, and a mostly vertical drag is a scroll, not a swipe
  await right(page);
  await swipe(page, [200, 520], [150, 200]);
  await stays(page, /\/dashboard\/today$/);
});

test("a swipe that starts in a text field or a dialog does not change the page", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "swipe navigation is for touch screens");
  await startFreshAccount(page);
  const w = page.viewportSize()?.width ?? 412;
  await page.goto("/dashboard/today");
  const field = page.getByPlaceholder(/Time:/);
  await expect(field).toBeVisible();
  const box = await field.boundingBox();
  if (!box) throw new Error("time field not on screen");
  await swipe(page, [w - 60, box.y + box.height / 2], [60, box.y + box.height / 2]);
  await stays(page, /\/dashboard\/today$/);

  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "New client" }).click(); // the form opens in place
  const name = page.getByLabel("New client name");
  await expect(name).toBeVisible();
  const field2 = await name.boundingBox();
  if (!field2) throw new Error("the new client field is not on screen");
  await swipe(page, [w - 60, field2.y + field2.height / 2], [60, field2.y + field2.height / 2]); // across a text field
  await stays(page, /\/dashboard\/clients$/);
});

/** Touch gestures are timing-sensitive: let the page settle after one before the next (a person never swipes 10 ms apart). */
const settle = (page: Page) => page.waitForTimeout(600);

/** The middle of an element on the page, to start a swipe from it. */
async function centreOf(_page: Page, locator: ReturnType<Page["locator"]>) {
  // Centred, because the bottom tab bar covers the foot of the screen: a touch under it hits the bar, not the page.
  await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await locator.boundingBox();
  if (!box) throw new Error("element not on screen");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}
const localISO = (page: Page, plusDays: number) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, plusDays);

test("on Today a swipe in the page body moves a day; the header still changes tab", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "swipe navigation is for touch screens");
  await startFreshAccount(page);
  const w = page.viewportSize()?.width ?? 412;
  await page.goto("/dashboard/today");
  const tile = page.getByRole("heading", { name: "Add to the day" });

  let { y } = await centreOf(page, tile);
  await swipe(page, [w - 40, y], [40, y]); // left: the next day
  await expect(page).toHaveURL(new RegExp(`date=${await localISO(page, 1)}`));
  await settle(page);
  ({ y } = await centreOf(page, tile)); // the header line changed, so the page may have moved a little
  await swipe(page, [40, y], [w - 40, y]); // right: back to today
  await expect(page).toHaveURL(/\/dashboard\/today$/);
  await settle(page);
  ({ y } = await centreOf(page, tile));
  await swipe(page, [40, y], [w - 40, y]); // right again: yesterday
  await expect(page).toHaveURL(new RegExp(`date=${await localISO(page, -1)}`));
  // the page did not change tab at any point
  expect(page.url()).toContain("/dashboard/today");
});

test("on Month a swipe on the calendar moves a month", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "swipe navigation is for touch screens");
  await startFreshAccount(page);
  const w = page.viewportSize()?.width ?? 412;
  await page.goto("/dashboard/month");
  const title = page.getByRole("heading", { level: 1 });
  const thisMonth = await title.innerText();
  const cell = page.getByRole("button", { name: /^\d{4}-\d\d-\d\d: / }).nth(10);
  const { y } = await centreOf(page, cell);

  await swipe(page, [w - 40, y], [40, y]);
  await expect(title).not.toHaveText(thisMonth);
  const nextMonth = await title.innerText();
  await settle(page);
  await swipe(page, [40, y], [w - 40, y]);
  await expect(title).toHaveText(thisMonth);
  expect(nextMonth).not.toBe(thisMonth);
});

test("on Week a swipe on the day strip picks the next or previous day", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "swipe navigation is for touch screens");
  await startFreshAccount(page);
  const w = page.viewportSize()?.width ?? 412;
  await page.goto("/dashboard/week");
  const strip = page.getByRole("tablist", { name: "Days of the week" });
  const { y } = await centreOf(page, strip);

  await swipe(page, [w - 40, y], [40, y]);
  await expect(page).toHaveURL(new RegExp(`date=${await localISO(page, 1)}`));
  await settle(page);
  await swipe(page, [40, y], [w - 40, y]);
  await settle(page);
  await swipe(page, [40, y], [w - 40, y]);
  await expect(page).toHaveURL(new RegExp(`date=${await localISO(page, -1)}`));
  expect(page.url()).toContain("/dashboard/week");
});

test("a meeting suggestion: swipe right adds it (once it has a project), swipe left skips it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "swipe navigation is for touch screens");
  await startFreshAccount(page);
  const w = page.viewportSize()?.width ?? 412;
  const card = page.getByRole("region", { name: "From your calendar" });
  await page
    .getByLabel("Choose calendar file")
    .setInputFiles({ name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(await icsFor(page)) });
  const planning = card.getByRole("listitem").filter({ hasText: "Offline Co planning" });
  const dentist = card.getByRole("listitem").filter({ hasText: "Dentist" });
  await expect(planning).toBeVisible();

  // Dentist has no project yet: swiping right asks for one and adds nothing
  const d = await centreOf(page, dentist.locator("p").first());
  await swipe(page, [40, d.y], [w - 40, d.y]);
  await expect(page.getByText(/Pick a project first/)).toBeVisible();
  await expect(dentist).toBeVisible();

  // swipe left skips it for good
  await swipe(page, [w - 40, d.y], [40, d.y]);
  await expect(dentist).toHaveCount(0);

  // the planning meeting has its project chosen: swipe right logs it, and it leaves the suggestions
  const p = await centreOf(page, planning.locator("p").first());
  await swipe(page, [40, p.y], [w - 40, p.y]);
  await expect(planning).toHaveCount(0);
  await expect(page.getByText("Offline Co planning").first()).toBeVisible(); // now an entry in the day's list
  expect(page.url()).toContain("/dashboard/today");
});
