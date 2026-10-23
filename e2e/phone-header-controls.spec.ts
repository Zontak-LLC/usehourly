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
test("on a phone the header controls share the title's line on Clients", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the wrapped header row only exists on a phone");
  await startFreshAccount(page);
  // (Today has no header controls since 2026-10-23: its day buttons live in the day card.)
  await page.goto("/dashboard/clients");
  // The last header control: the page's ··· menu (New client sits before it).
  const add = page.getByRole("button", { name: "More actions for Clients" });
  await expect(add).toBeVisible();
  expect((await gapToHeaderEdge(add)).right).toBeLessThan(20); // the last button reaches the card's right padding
  const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
  const box = await add.boundingBox();
  if (!heading || !box) throw new Error("heading or button not on screen");
  expect(Math.abs(box.y + box.height / 2 - (heading.y + heading.height / 2))).toBeLessThan(16); // same line as "Clients"
});
