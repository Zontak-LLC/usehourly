import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";

// On a phone the sample's four project pills pushed Log time under the bottom menu at load (2026-10-25). The button now
// stays just above the menu until the page reaches its place in the form.
test("on a phone Today's Log time button is in view at load, above the menu, and back in the form at the end", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "a phone check");
  await startDemo(page);
  await page.goto("/dashboard/today");
  const log = page.getByRole("button", { name: /^Log time/ });
  const menu = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Week" }) });
  await expect(log).toBeVisible();

  // nothing scrolled: the button ends above the menu, and a tap on its middle lands on it (not on the menu)
  const button = await log.boundingBox();
  const bar = await menu.last().boundingBox();
  expect(button && bar, "both are on screen").toBeTruthy();
  if (!button || !bar) return;
  expect(button.y + button.height).toBeLessThanOrEqual(bar.y);
  const onTop = await log.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(onTop).toBe(true);

  // it still works from there: a quick time, then Log time
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await log.click();
  await expect(page.getByText("Logged 1:00")).toBeVisible();

  // scrolled to the bottom it sits back in its place, under the note box (after a save its label names the entry)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const description = await page.locator("form textarea").first().boundingBox();
  const settled = await log.boundingBox();
  expect(description && settled && settled.y > description.y).toBe(true);
});
