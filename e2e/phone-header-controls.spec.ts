import type { Locator } from "@playwright/test";

import { expect, startFreshAccount, test } from "./helpers";

/** The right edge of an element, and how far it sits from the card header's right edge. */
async function gapToHeaderEdge(control: Locator) {
  const box = await control.boundingBox();
  const header = await control.locator("xpath=ancestor::header[1]").boundingBox();
  if (!box || !header) throw new Error("control or header not on screen");
  return { right: header.x + header.width - (box.x + box.width), width: box.width, headerWidth: header.width };
}

/**
 * On a phone the page card's header controls sit on their own row under the title and must fill it (a short row of
 * buttons stuck at the left with empty space beside it looked broken on Today and Clients).
 */
test("on a phone the header controls share the title's line on Today and on Clients", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the wrapped header row only exists on a phone");
  await startFreshAccount(page);

  await page.goto("/dashboard/today");
  const next = page.getByRole("button", { name: "Next day" });
  await expect(next).toBeVisible();
  expect((await gapToHeaderEdge(next)).right).toBeLessThan(20); // the last button reaches the card's right padding
  const todayHeading = await page.getByRole("heading", { level: 1 }).boundingBox();
  const nextBox = await next.boundingBox();
  if (!todayHeading || !nextBox) throw new Error("heading or button not on screen");
  expect(Math.abs(nextBox.y + nextBox.height / 2 - (todayHeading.y + todayHeading.height / 2))).toBeLessThan(16); // same line as "Today"

  await page.goto("/dashboard/clients");
  const add = page.getByRole("button", { name: "New client" });
  await expect(add).toBeVisible();
  // one line with the title: the button sits level with the heading, not on a row of its own
  const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
  const button = await add.boundingBox();
  if (!heading || !button) throw new Error("heading or button not on screen");
  expect(Math.abs(button.y + button.height / 2 - (heading.y + heading.height / 2))).toBeLessThan(16);
});
