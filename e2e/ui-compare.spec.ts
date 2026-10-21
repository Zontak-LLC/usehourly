import { expect, test } from "@playwright/test";

import { mkdirSync } from "node:fs";

/**
 * Not part of a normal run. Photographs the main screens of the sample-data demo so a UI change can be shown as a
 * before and after:
 *   UI_SHOTS=before npx playwright test e2e/ui-compare.spec.ts      (on the code as it is)
 *   UI_SHOTS=after  npx playwright test e2e/ui-compare.spec.ts      (after the change)
 * Pictures go to e2e/report/ui/<label>-<screen>-<desktop|phone>.png; `node scripts/ui-compare.mjs <screen>` joins a
 * before and after side by side. The demo account is removed by the app's own 24-hour sweep.
 */
const label = process.env.UI_SHOTS;
test.skip(!label, "only when comparing a UI change");

const SCREENS: [name: string, url: string][] = [
  ["today", "/dashboard/today"],
  ["week", "/dashboard/week"],
  ["month", "/dashboard/month"],
  ["invoices", "/dashboard/invoices"],
  ["clients", "/dashboard/clients"],
];

test("photograph the main screens", async ({ page }, info) => {
  mkdirSync("e2e/report/ui", { recursive: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  for (const [name, url] of SCREENS) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `e2e/report/ui/${label}-${name}-${info.project.name}.png`,
      fullPage: true,
      caret: "initial",
    });
  }
});
