import { expect, test } from "@playwright/test";

import { mkdirSync } from "node:fs";

/**
 * Not part of a normal run. Retakes the pictures on the landing page from the real app, using the sample-data demo:
 *   LANDING_SHOTS=1 npx playwright test e2e/landing-shots.spec.ts --project=desktop
 * It writes PNGs to e2e/report/landing/; turn them into webp and copy them over public/landing/ (see CLAUDE.md).
 * The demo account it makes is removed by the app's own 24-hour sweep.
 */
test.skip(!process.env.LANDING_SHOTS, "only when refreshing the landing page pictures");
// Tall, so the whole page fits and nothing scrolls under the sticky header while it is photographed.
test.use({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 2 });

/**
 * The Thursday of last week: a full past week of sample data (the demo has entries on weekdays), so the pictures show a
 * busy week rather than today's empty page.
 */
function lastThursday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 4);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SCREENS: [name: string, url: string][] = [
  ["week", `/dashboard/week?date=${lastThursday()}`],
  ["month", "/dashboard/month"],
  ["report", "/dashboard/report"],
];

test("retake the landing page pictures", async ({ page }) => {
  mkdirSync("e2e/report/landing", { recursive: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  for (const [name, url] of SCREENS) {
    await page.goto(url);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // the dev badge
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // the page's own content column, without the sidebar or the sample-data banner
    const content = page.locator("h1").first().locator("xpath=ancestor::div[contains(@class,'mx-auto')][1]");
    await content.screenshot({ path: `e2e/report/landing/${name}.png`, animations: "disabled", caret: "initial" });
  }
});
