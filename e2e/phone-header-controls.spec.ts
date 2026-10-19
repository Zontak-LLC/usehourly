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
 * buttons stuck at the left with empty space beside it looked broken on Today and Clients & Projects).
 */
test("on a phone the header buttons fill the row on Today and on Clients & Projects", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the wrapped header row only exists on a phone");
  await startFreshAccount(page);

  await page.goto("/dashboard/today");
  const next = page.getByRole("button", { name: "Next day" });
  await expect(next).toBeVisible();
  expect((await gapToHeaderEdge(next)).right).toBeLessThan(20); // the last button reaches the card's right padding

  await page.goto("/dashboard/clients");
  const add = page.getByRole("button", { name: "New client" });
  await expect(add).toBeVisible();
  const g = await gapToHeaderEdge(add);
  expect(g.width).toBeGreaterThan(g.headerWidth * 0.85); // one wide button, not a small one at the left
});
