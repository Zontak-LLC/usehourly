import type { Page } from "@playwright/test";

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
